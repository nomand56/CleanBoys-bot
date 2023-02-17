const { MongoClient } = require("mongodb");

// for localhost use "mongodb://0.0.0.0:27017"
const url = "mongodb+srv://abc123:5mAu3FPveuryEMvb@cluster0.jpioi6p.mongodb.net/"; //process.env.DB
const dbclient = new MongoClient(url);

async function connectDB() {
  await dbclient.connect();
  return dbclient.db("cleanboys");
}

module.exports = { connectDB, dbclient };
