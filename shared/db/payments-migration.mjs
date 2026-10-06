// One-off migration for Razorpay payments. Run from the project root:
//   node --env-file=.env shared/db/payments-migration.mjs
// Safe to run more than once. Only creates the new "payments" table; existing tables are not touched.
import pg from "pg";

const sql = `
CREATE TABLE IF NOT EXISTS payments (
  id serial PRIMARY KEY,
  user_id integer NOT NULL,
  course_id integer NOT NULL,
  razorpay_order_id text NOT NULL,
  razorpay_payment_id text,
  amount integer NOT NULL,
  currency text DEFAULT 'INR' NOT NULL,
  coupon_id integer,
  status text DEFAULT 'created' NOT NULL,
  failure_reason text,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL,
  CONSTRAINT payments_razorpay_order_id_unique UNIQUE (razorpay_order_id),
  CONSTRAINT payments_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT payments_course_id_courses_id_fk FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
  CONSTRAINT payments_coupon_id_coupons_id_fk FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS payments_user_id_idx ON payments (user_id);
`;

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query(sql);
const { rows } = await client.query("SELECT table_name FROM information_schema.tables WHERE table_name = 'payments'");
console.log("Tables present:", rows.map((r) => r.table_name).join(", "));
await client.end();
