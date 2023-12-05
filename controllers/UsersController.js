import dbClient from '../utils/db';

const sha1 = require('sha1');

const postNew = async (req, res) => {
  const { email, password } = req.body;

  if (!email) return res.status(400).send({ error: 'Missing email' });
  if (!password) return res.status(400).send({ error: 'Missing password' });

  const emailCheck = await dbClient.db.collection('users').findOne({ email });

  if (emailCheck) return res.status(400).send({ error: 'Already exist' });

  const addUser = await dbClient.db.collection('users').insertOne({ email, password: sha1(password) });

  return res.status(201).send({ id: addUser.insertedId, email });
};

export default postNew;
