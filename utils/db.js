const { MongoClient } = require('mongodb');

class DBClient {
  constructor(host = 'localhost', port = 27017, database = 'files_manager') {
    this.host = process.env.DB_HOST || host;
    this.port = process.env.DB_PORT || port;
    this.database = process.env.DB_DATABASE || database;
    const url = `mongodb://${this.host}:${this.port}/${this.database}`;
    this.status = false;
    MongoClient.connect(url, { useUnifiedTopology: true }, (err, client) => {
      if (!err) {
        this.status = true;
        this.db = client.db(this.database);
      } else {
        this.status = false;
      }
    });
  }

  isAlive() {
    return this.status;
  }

  async nbUsers() {
    return this.db.collection('users').countDocuments();
  }

  async nbFiles() {
    return this.db.collection('files').countDocuments();
  }
}

const dbclient = new DBClient();
export default dbclient;
