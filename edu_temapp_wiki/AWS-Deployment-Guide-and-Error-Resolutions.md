# AWS Deployment Guide & Error Resolutions (Oct 2026)

This document serves as the master knowledge base for deploying the Node.js Serverless Backend and the React CMS to AWS, detailing the exact errors encountered and how they were resolved. **Future developers must refer to this when creating a new app or experiencing Lambda crashes.**

## 1. System Architecture
- **Backend**: Node.js + Express + Drizzle ORM
- **Deployment**: Serverless Framework (`serverless.yml`) -> AWS Lambda & API Gateway
- **Frontend/CMS**: React (Vite) deployed typically to Vercel/Netlify.

---

## 2. VPC & NAT Gateway Configuration
When deploying a Lambda function that needs to connect to an RDS (PostgreSQL) database inside a VPC, the Lambda **must** also be placed inside that VPC. 

### The Problem
If the Lambda is inside a VPC (using a Private Subnet), it **loses its default public internet access**. This means Firebase Admin (`auth.verifyIdToken`) and Razorpay API calls will time out and fail, effectively breaking the app.

### The Solution
1. **Private Subnet**: Place the Lambda in a Private Subnet.
2. **NAT Gateway**: Create a NAT Gateway in a Public Subnet and attach an Elastic IP to it.
3. **Route Table**: Configure the Route Table of the Private Subnet to route all internet-bound traffic (`0.0.0.0/0`) through the NAT Gateway.
4. **Security Groups**: Ensure the Lambda's Security Group allows outbound traffic to the internet (or specifically to Firebase/Razorpay IPs) and allows inbound traffic from the API Gateway. Ensure the RDS Security Group allows inbound PostgreSQL (`5432`) traffic from the Lambda's Security Group.

**In `serverless.yml`:**
```yaml
provider:
  vpc:
    securityGroupIds:
      - sg-0c07d868d37903d36 # The Security Group attached to Lambda
    subnetIds:
      - subnet-075e2e2d787f424a9 # The Private Subnet routed to the NAT Gateway
```

---

## 3. Critical Lambda Runtime Errors & Resolutions

During deployment, the backend compiled successfully but returned HTTP 500 Internal Server Error when pinged via API Gateway. AWS CloudWatch logs revealed the following sequential crashes:

### Error 1: `ERR_MODULE_NOT_FOUND` for `firebase-admin`
**Log:** `Cannot find package 'firebase-admin' imported from /var/task/dist/lambda.mjs`
- **Cause:** The `build.mjs` (esbuild) script had `firebase-admin` listed in the `external` array. The Serverless Framework only packages the `dist/` directory and ignores `node_modules/` to keep the zip file small. At runtime, Lambda couldn't find the package.
- **Solution:** Removed `firebase-admin` (and `@aws-sdk/*`) from the `external` array in `build.mjs`. This forces esbuild to bundle the exact necessary code directly into `lambda.mjs`.

### Error 2: `ENOENT` for `firebase-service-account.json`
**Log:** `ENOENT: no such file or directory, open '/var/task/firebase-service-account.json'`
- **Cause:** The Firebase admin initialization script (`src/lib/firebase-admin.ts`) relies on reading this JSON file. Because it contains secrets, it was in `.gitignore` and consequently excluded from the Serverless deployment zip.
- **Solution:** Explicitly included the file in `serverless.yml` packaging rules.
```yaml
package:
  patterns:
    - '!**'
    - 'dist/**'
    - '.env'
    - 'firebase-service-account.json'
```
*Note: The file remains in `.gitignore` so it never goes to GitHub, but Serverless packages it into the AWS zip.*

### Error 3: `ENOENT` on `mkdir('/var/task/uploads')`
**Log:** `ENOENT: no such file or directory, mkdir '/var/task/uploads'`
- **Cause:** The backend's media/upload routes attempted to create a local `uploads/` directory inside the current working directory. AWS Lambda's `/var/task/` execution environment is **strictly read-only**.
- **Solution:** Modified `src/lib/media.ts` to detect the AWS Lambda environment via the `AWS_LAMBDA_FUNCTION_NAME` environment variable and route all temporary file operations to the `/tmp/` directory, which is the only writable partition in Lambda (max 512MB).
```typescript
export const UPLOAD_DIR = process.env.AWS_LAMBDA_FUNCTION_NAME
  ? "/tmp/uploads"
  : path.join(process.cwd(), "uploads");
```

---

## 4. Git Security & Secrets Hardening
The `Backend/.serverless/` folder was accidentally tracked in git, which meant the `.zip` file containing `.env` and AWS/Razorpay secrets was pushed to the repository history.

**Remediation:**
1. Ran `git rm -r --cached Backend/.serverless` to untrack the directory.
2. Added `.serverless/` and `*.pem`/`*.key` to `.gitignore`.
3. Created a robust `.githooks/pre-commit` hook that actively parses `git diff` for staged `.env` files and rejects the commit if found, even if a user tries `git add -f`. 
4. Auto-enabled this hook for all developers by adding `"prepare": "git config core.hooksPath .githooks"` to the root `package.json`.
