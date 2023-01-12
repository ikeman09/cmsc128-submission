const mongoose = require('mongoose')

let conn: object | null = null

const connectToDatabase = async () => {
  if (conn == null) {
    const mongoURI = `mongodb+srv://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_CLUSTER}/gasolater-${process.env.DEPLOYMENT_ENV}`
    mongoose.set("strictQuery", false);
    conn = mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 5000 // Keep trying to send operations for 5 seconds
    })

    await conn
  }

  return conn
}

module.exports = connectToDatabase
