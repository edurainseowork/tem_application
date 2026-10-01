import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { UPLOAD_DIR } from "./lib/media";
import {
  apiContentSecurityPolicy,
  corsOptions,
  rateLimit,
  securityHeaders,
} from "./middlewares/security";
import { errorHandler } from "./middlewares/error-handler";

const app: Express = express();

app.disable("x-powered-by");
// Number of reverse proxies in front of the app (API Gateway / load balancer), so req.ip
// is the real client IP for rate limiting. Leave unset when running directly.
const trustProxy = process.env.TRUST_PROXY;
if (trustProxy) {
  app.set("trust proxy", /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);
}

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(securityHeaders);
app.use(cors(corsOptions()));
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));

app.use(
  "/uploads",
  express.static(UPLOAD_DIR, {
    dotfiles: "deny",
    index: false,
    redirect: false,
    fallthrough: false,
  }),
);

app.use("/api", apiContentSecurityPolicy, rateLimit({ windowMs: 60_000, max: 300 }), router);
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use(errorHandler);

export default app;
