import { pool, db } from "./index";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  console.log("Starting database migration for course_content...");
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Ensure course_content table exists
    console.log("Checking / creating course_content table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS course_content (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        course_id integer NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        parent_id uuid,
        title varchar(255) NOT NULL,
        type varchar(50) NOT NULL,
        media_url text,
        file_size varchar(50),
        "order" integer NOT NULL DEFAULT 0,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      );
    `);

    // 2. If table existed with text id or columns need adjustments:
    // Check id column type
    const idColRes = await client.query(`
      SELECT data_type, udt_name 
      FROM information_schema.columns 
      WHERE table_name = 'course_content' AND column_name = 'id';
    `);

    if (idColRes.rows.length > 0) {
      const udt = idColRes.rows[0].udt_name;
      console.log(`Current course_content.id column type: ${udt}`);
      if (udt !== "uuid") {
        // Clean up or cast any invalid uuid rows if necessary
        await client.query(`
          UPDATE course_content 
          SET id = gen_random_uuid() 
          WHERE id IS NULL OR length(id) < 30;
        `);
        // Drop any old constraints referencing id
        await client.query(`
          ALTER TABLE course_content DROP CONSTRAINT IF EXISTS course_content_parent_id_fk;
          ALTER TABLE course_content DROP CONSTRAINT IF EXISTS course_content_parent_id_course_content_id_fk;
        `);
        await client.query(`
          ALTER TABLE course_content ALTER COLUMN id DROP DEFAULT;
          ALTER TABLE course_content ALTER COLUMN id TYPE uuid USING id::uuid;
          ALTER TABLE course_content ALTER COLUMN id SET DEFAULT gen_random_uuid();
        `);
      }
    }

    // Check parent_id column type
    const parentIdColRes = await client.query(`
      SELECT data_type, udt_name 
      FROM information_schema.columns 
      WHERE table_name = 'course_content' AND column_name = 'parent_id';
    `);

    if (parentIdColRes.rows.length > 0) {
      const udt = parentIdColRes.rows[0].udt_name;
      console.log(`Current course_content.parent_id column type: ${udt}`);
      if (udt !== "uuid") {
        await client.query(`
          ALTER TABLE course_content ALTER COLUMN parent_id TYPE uuid USING parent_id::uuid;
        `);
      }
    }

    // Check self-referencing foreign key constraint
    const fkRes = await client.query(`
      SELECT constraint_name 
      FROM information_schema.table_constraints 
      WHERE table_name = 'course_content' 
        AND constraint_type = 'FOREIGN KEY' 
        AND constraint_name IN ('course_content_parent_id_fk', 'course_content_parent_id_course_content_id_fk');
    `);

    if (fkRes.rows.length === 0) {
      console.log("Adding foreign key constraint for parent_id -> course_content(id)...");
      await client.query(`
        ALTER TABLE course_content 
        ADD CONSTRAINT course_content_parent_id_fk 
        FOREIGN KEY (parent_id) REFERENCES course_content(id) ON DELETE CASCADE;
      `);
    }

    // Check type column
    const typeColRes = await client.query(`
      SELECT data_type, udt_name 
      FROM information_schema.columns 
      WHERE table_name = 'course_content' AND column_name = 'type';
    `);
    if (typeColRes.rows.length > 0) {
      const udt = typeColRes.rows[0].udt_name;
      if (udt !== "varchar") {
        await client.query(`
          ALTER TABLE course_content ALTER COLUMN type TYPE varchar(50) USING type::varchar;
        `);
      }
    }

    // Check title column
    const titleColRes = await client.query(`
      SELECT data_type, character_maximum_length 
      FROM information_schema.columns 
      WHERE table_name = 'course_content' AND column_name = 'title';
    `);
    if (titleColRes.rows.length > 0) {
      const maxLen = titleColRes.rows[0].character_maximum_length;
      if (maxLen !== 255) {
        await client.query(`
          ALTER TABLE course_content ALTER COLUMN title TYPE varchar(255) USING title::varchar;
        `);
      }
    }

    // 3. Create required indexes for fast retrieval:
    // (course_id, parent_id) and (course_id, order)
    console.log("Creating composite indexes on (course_id, parent_id) and (course_id, order)...");
    await client.query(`
      CREATE INDEX IF NOT EXISTS course_content_course_id_parent_id_idx 
      ON course_content (course_id, parent_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS course_content_course_id_order_idx 
      ON course_content (course_id, "order");
    `);

    // 4. Ensure Drizzle migrations tracking table exists and record migration
    await client.query(`
      CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      );
    `);

    const migCheck = await client.query(`
      SELECT id FROM "__drizzle_migrations" LIMIT 1;
    `);
    if (migCheck.rows.length === 0) {
      await client.query(`
        INSERT INTO "__drizzle_migrations" (hash, created_at)
        VALUES ('0000_course_content_init', ${Date.now()});
      `);
    }

    await client.query("COMMIT");
    console.log("Database migration completed successfully!");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration()
  .then(() => {
    console.log("Migration script finished.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Fatal migration error:", err);
    process.exit(1);
  });
