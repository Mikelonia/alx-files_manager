import dbclient from './utils/db';

const Bull = require('bull');
const { ObjectId } = require('mongodb');
const imageThumbnail = require('image-thumbnail');
const fs = require('fs');

const fileQueue = new Bull('fileQueue');
const userQueue = new Bull('userQueue');

const createImageThumbnail = async (path, options) => {
  try {
    const thumbnail = await imageThumbnail(path, options);
    const pathN = `${path}_${options.width}`;

    await fs.writeFileSync(pathN, thumbnail);
  } catch (err) {
    console.log(err);
  }
};

fileQueue.process(async (job) => {
  const { fileId } = job.data;
  if (!fileId) throw Error('Missing fileId');

  const { userId } = job.data;
  if (!userId) throw Error('Missing userId');

  const fileDocument = await dbclient.db.collection('files').findOne({ _id: ObjectId(fileId), userId: ObjectId(userId) });
  if (!fileDocument) throw Error('File not found');

  createImageThumbnail(fileDocument.localPath, { width: 500 });
  createImageThumbnail(fileDocument.localPath, { width: 250 });
  createImageThumbnail(fileDocument.localPath, { width: 100 });
});

userQueue.process(async (job) => {
  const { userId } = job.data;
  if (!userId) throw Error('Missing userId');

  const userDocument = await dbclient.db.collection('users').findOne({ _id: ObjectId(userId) });
  if (!userDocument) throw Error('User not found');

  console.log(`Welcome ${userDocument.email}`);
});
