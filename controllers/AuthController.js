import dbclient from '../utils/db';
import redisClient from '../utils/redis';

const { ObjectId } = require('mongodb');
const sha1 = require('sha1');
const { v4: uuidv4 } = require('uuid');

export const getConnect = async (req, res) => {
  const { authorization } = req.headers;

  if (!authorization || !authorization.startsWith('Basic ')) {
    return res.status(401).send({ error: 'Unauthorized' });
  }
  try {
    const credentials = Buffer.from(authorization.split(' ')[1], 'base64').toString();
    const [email, password] = credentials.split(':');

    const user = await dbclient.db.collection('users').findOne({ email, password: sha1(password) });
    const uuid = uuidv4();
    const authKey = `auth_${uuid}`;
    await redisClient.set(authKey, user._id.toString(), 24 * 60 * 60);
    return res.status(200).send({ token: uuid });
  } catch (error) {
    return res.status(401).send({ error: 'Unauthorized' });
  }
};

export const getDisconnect = async (req, res) => {
  const xtoken = req.headers['x-token'];
  const getUsr = await redisClient.get(`auth_${xtoken}`);

  const usr = await dbclient.db.collection('users').findOne({ _id: new ObjectId(getUsr) });
  if (!usr) {
    return res.status(401).send({ error: 'Unauthorized' });
  }
  await redisClient.del(`auth_${xtoken}`);
  return res.status(204).send({});
};

export const getMe = async (req, res) => {
  const xtoken = req.headers['x-token'];
  const getUsr = await redisClient.get(`auth_${xtoken}`);

  const usr = await dbclient.db.collection('users').findOne({ _id: new ObjectId(getUsr) });
  if (!usr) {
    return res.status(401).send({ error: 'Unauthorized' });
  }
  return res.send({ id: usr._id.toString(), email: usr.email });
};
