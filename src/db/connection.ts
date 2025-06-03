import mongoose from "mongoose"

let conn: any = null

export async function requestConnection(
  uri: string,
  extraOptions?: mongoose.ConnectOptions
) {
  if (conn === null) {
    conn = mongoose
      .connect(uri, {
        bufferCommands: false, // Disable mongoose buffering
        // bufferMaxEntries: 0, // and MongoDB driver buffering
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 30000,
        ...extraOptions,
      })
      .then(() => mongoose)
    await conn
  }
  return conn
}

export { mongoose }
