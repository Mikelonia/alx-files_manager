/* eslint-disable import/no-named-as-default By Okpako Michael*/
import dbclient from '../utils/db';
import redisClient from '../utils/redis';

export const getStatus = (req, res) => res.status(200).send(
  {
    redis: redisClient.isAlive(),
    db: dbclient.isAlive(),
  },
);

export const getStats = async (req, res) => res.status(200).send(
  {
    users: await dbclient.nbUsers(),
    files: await dbclient.nbFiles(),
  },
);
