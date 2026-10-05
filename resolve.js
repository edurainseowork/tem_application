const fs = require('fs');
const execSync = require('child_process').execSync;

function keepOurs(file) {
    execSync(`git checkout --ours -- "${file}"`);
    execSync(`git add "${file}"`);
}

function keepTheirs(file) {
    execSync(`git checkout --theirs -- "${file}"`);
    execSync(`git add "${file}"`);
}

keepOurs('.npmrc');
keepOurs('pnpm-lock.yaml');
keepOurs('Backend/src/middlewares/auth.ts');
keepOurs('Backend/src/routes/auth.ts');

keepTheirs('shared/db/src/schema/index.ts');
keepTheirs('Frontend/app/course/[id].tsx');

keepTheirs('Backend/src/routes/notifications.ts');
let notif = fs.readFileSync('Backend/src/routes/notifications.ts', 'utf8');
notif = notif.replace(/res\.locals\.firebaseUser/g, 'req.auth!');
fs.writeFileSync('Backend/src/routes/notifications.ts', notif);
execSync('git add Backend/src/routes/notifications.ts');

keepTheirs('Backend/src/routes/liveClasses.ts');
let lc = fs.readFileSync('Backend/src/routes/liveClasses.ts', 'utf8');
lc = lc.replace(/res\.locals\.firebaseUser/g, 'req.auth!');
lc = lc.replace(/await db\.delete\(liveClassesTable\)\.where\(eq\(liveClassesTable\.id, id\)\);/, 
  'await db.transaction(async (tx) => { await tx.delete(notificationsTable).where(eq(notificationsTable.liveClassId, id)); await tx.delete(liveClassesTable).where(eq(liveClassesTable.id, id)); });');
fs.writeFileSync('Backend/src/routes/liveClasses.ts', lc);
execSync('git add Backend/src/routes/liveClasses.ts');

keepTheirs('Backend/src/routes/coupons.ts');
let coup = fs.readFileSync('Backend/src/routes/coupons.ts', 'utf8');
coup = coup.replace(/res\.locals\.firebaseUser/g, 'req.auth!');
fs.writeFileSync('Backend/src/routes/coupons.ts', coup);
execSync('git add Backend/src/routes/coupons.ts');

keepTheirs('Backend/src/routes/index.ts');
let idx = fs.readFileSync('Backend/src/routes/index.ts', 'utf8');
idx = idx.replace(/<<<<<<< HEAD[\s\S]*?=======\n/m, '');
idx = idx.replace(/>>>>>>> origin\/rohit\n?/m, '');
fs.writeFileSync('Backend/src/routes/index.ts', idx);
execSync('git add Backend/src/routes/index.ts');

console.log('Done resolving easy files');
