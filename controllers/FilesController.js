import Queue from 'bull/lib/queue';
import mime from 'mime-types';
import dbclient from '../utils/db';
import redisClient from '../utils/redis';

const { ObjectId } = require('mongodb');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

export const postUpload = async (req, res) => {
  const fileQ = new Queue('fileQ');
  const xtoken = req.headers['x-token'];
  const getUsr = await redisClient.get(`auth_${xtoken}`);

  const usr = await dbclient.db.collection('users').findOne({ _id: new ObjectId(getUsr) });
  if (!usr) {
    return res.status(401).send({ error: 'Unauthorized' });
  }
  const {
    name,
    type,
    data,
    parentId,
    isPublic,
  } = req.body;
  const fileTypes = ['folder', 'file', 'image'];

  if (!name) return res.status(400).send({ error: 'Missing name' });
  if (!type || !fileTypes.includes(type)) return res.status(400).send({ error: 'Missing type' });
  if (!data && type !== 'folder') return res.status(400).send({ error: 'Missing data' });
  if (parentId) {
    const fileByParentId = await dbclient.db.collection('files').findOne({ _id: new ObjectId(parentId) });
    if (!fileByParentId) {
      return res.status(400).send({ error: 'Parent not found' });
    }
    if (fileByParentId && fileByParentId.type !== 'folder') {
      return res.status(400).send({ error: 'Parent is not a folder' });
    }
  }
  if (type === 'folder') {
    const folderCreated = await dbclient.db.collection('files').insertOne({
      name,
      type,
      userId: usr._id.toString(),
      parentId: parentId || 0,
      isPublic: isPublic || false,
    });
    return res.status(201).send({
      id: folderCreated.ops[0]._id,
      userId: folderCreated.ops[0].userId,
      name: folderCreated.ops[0].name,
      type: folderCreated.ops[0].type,
      isPublic: folderCreated.ops[0].isPublic,
      parentId: folderCreated.ops[0].parentId,
    });
  }
  const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';

  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }

  const uuid = uuidv4();
  const filePath = `${folderPath}/${uuid}`;

  fs.writeFileSync(filePath, Buffer.from(data, 'base64').toString());
  const fileCreated = await dbclient.db.collection('files').insertOne({
    name,
    type,
    userId: usr._id.toString(),
    isPublic: isPublic || false,
    parentId: parentId || 0,
    localPath: filePath,
  });
  fileQ.add({
    userId: fileCreated.userId,
    fileId: fileCreated._id,
  });
  return res.status(201).send({
    id: fileCreated.ops[0]._id,
    userId: fileCreated.ops[0].userId,
    name: fileCreated.ops[0].name,
    type: fileCreated.ops[0].type,
    isPublic: fileCreated.ops[0].isPublic,
    parentId: fileCreated.ops[0].parentId,
  });
};

export const getIndex = async (req, res) => {
  const xtoken = req.headers['x-token'];
  const getUsr = await redisClient.get(`auth_${xtoken}`);

  if (!getUsr) {
    return res.status(401).send({ error: 'Unauthorized' });
  }
  const usr = await dbclient.db.collection('users').findOne({ _id: ObjectId(getUsr) });
  if (!usr) return res.status(401).send({ error: 'Unauthorized' });

  let parentId = req.query.parentId || 0;
  if (parentId === 0) parentId = 0;
  if (parentId !== 0) {
    if (!parentId) return res.status(401).send({ error: 'Unauthorized' });

    const folder = await dbclient.db.collection('files').findOne({ _id: ObjectId(parentId) });

    if (!folder || folder.type !== 'folder') return res.status(200).send([]);
  }

  const page = req.query.page || 0;

  const agg = { parentId };
  let aggData = [{ $match: agg }, { $skip: page * 20 }, { $limit: 20 }];
  if (parentId === 0) {
    aggData = [{ $skip: page * 20 }, { $limit: 20 }];
  }

  const pageFiles = await dbclient.db.collection('files').aggregate(aggData);
  const files = [];

  await pageFiles.forEach((file) => {
    const fileObj = {
      id: file._id,
      userId: file.userId,
      name: file.name,
      type: file.type,
      isPublic: file.isPublic,
      parentId: file.parentId,
    };
    files.push(fileObj);
  });

  return res.status(200).send(files);
};

export const getShow = async (req, res) => {
  const xtoken = req.headers['x-token'];
  const getUsr = await redisClient.get(`auth_${xtoken}`);

  if (!getUsr) {
    return res.status(401).send({ error: 'Unauthorized' });
  }
  const usr = await dbclient.db.collection('users').findOne({ _id: ObjectId(getUsr) });
  if (!usr) return res.status(401).send({ error: 'Unauthorized' });

  const { id } = req.params;
  const file = await dbclient.db.collection('files').findOne({ _id: ObjectId(id), userId: usr._id });
  if (!file) {
    return res.status(404).send({ error: 'Not found' });
  }

  return res.status(200).send({
    id: file._id,
    userId: file.userId,
    name: file.name,
    type: file.type,
    isPublic: file.isPublic,
    parentId: file.parentId,
  });
};

export const putPublish = async (req, res) => {
  const xtoken = req.headers['x-token'];
  const getUsr = await redisClient.get(`auth_${xtoken}`);
  const id = req.params.id || '';

  if (!getUsr) {
    return res.status(401).send({ error: 'Unauthorized' });
  }
  const usr = await dbclient.db.collection('users').findOne({ _id: ObjectId(getUsr) });
  if (!usr) return res.status(401).send({ error: 'Unauthorized' });

  let file = await dbclient.db.collection('files').findOne({ _id: ObjectId(id), userId: usr._id });
  if (!file) {
    return res.status(404).send({ error: 'Not found' });
  }
  await dbclient.db.collection('files').updateOne({ _id: ObjectId(id), userId: usr._id }, { $set: { isPublic: true } });
  file = await dbclient.db.collection('files').findOne({ _id: ObjectId(id), userId: usr._id });

  return res.status(200).send({
    id: file._id,
    userId: file.userId,
    name: file.name,
    type: file.type,
    isPublic: file.isPublic,
    parentId: file.parentId,
  });
};

export const putUnpublish = async (req, res) => {
  const xtoken = req.headers['x-token'];
  const getUsr = await redisClient.get(`auth_${xtoken}`);
  const id = req.params.id || '';

  if (!getUsr) {
    return res.status(401).send({ error: 'Unauthorized' });
  }
  const usr = await dbclient.db.collection('users').findOne({ _id: ObjectId(getUsr) });
  if (!usr) return res.status(401).send({ error: 'Unauthorized' });

  let file = await dbclient.db.collection('files').findOne({ _id: ObjectId(id), userId: usr._id });
  if (!file) {
    return res.status(404).send({ error: 'Not found' });
  }
  await dbclient.db.collection('files').updateOne({ _id: ObjectId(id), userId: usr._id }, { $set: { isPublic: false } });
  file = await dbclient.db.collection('files').findOne({ _id: ObjectId(id), userId: usr._id });

  return res.status(200).send({
    id: file._id,
    userId: file.userId,
    name: file.name,
    type: file.type,
    isPublic: file.isPublic,
    parentId: file.parentId,
  });
};

export const getFile = async (req, res) => {
  const xtoken = req.headers['x-token'];
  const getUsr = await redisClient.get(`auth_${xtoken}`);
  const id = req.params.id || '';
  const size = req.query.size || 0;

  const file = await dbclient.db.collection('files').findOne({ _id: ObjectId(id) });
  if (!file) return res.status(404).send({ error: 'Not found' });

  const { userId, type, isPublic } = file;

  let usr = null;
  let owner = false;
  if (getUsr) {
    usr = await dbclient.db.collection('users').findOne({ _id: ObjectId(getUsr) });
    if (usr) {
      owner = usr._id.toString() === userId;
    }
  }

  if (!isPublic && !owner) return res.status(404).send({ error: 'Not found' });
  if (type === 'folder') return res.status(400).send({ error: 'A folder doesn\'t have a content' });

  const path = size === 0 ? file.localPath : `${file.localPath}_${size}`;

  try {
    const fileData = fs.readFileSync(path);
    const mimeType = mime.contentType(file.name);
    res.setHeader('Content-Type', mimeType);
    return res.status(200).send(fileData);
  } catch (error) {
    return res.status(404).send({ error: 'Not found' });
  }
};
