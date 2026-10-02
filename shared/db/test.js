import pg from 'pg';
const { Client } = pg;
const client = new Client({
  connectionString: "postgresql://postgres:Aryan1400@database-2.cluster-cpm4oeo2cf6s.ap-south-1.rds.amazonaws.com:5432/postgres?sslmode=no-verify",
});
client.connect()
  .then(async () => {
    console.log("Connected successfully");
    client.end();
  })
  .catch(err => {
    console.error("Connection error", err);
    client.end();
  });
