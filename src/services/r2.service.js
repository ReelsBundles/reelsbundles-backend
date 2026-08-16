import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";

import { r2, R2_BUCKET } from "../config/r2.js";

class R2Service {
  async upload(key, buffer, contentType) {
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    });

    return await r2.send(command);
  }

  async download(key) {
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
    });

    return await r2.send(command);
  }

  async delete(key) {
    const command = new DeleteObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
    });

    return await r2.send(command);
  }

  async list(prefix = "") {
    const command = new ListObjectsV2Command({
      Bucket: R2_BUCKET,
      Prefix: prefix,
    });

    return await r2.send(command);
  }

  async exists(key) {
    try {
      const command = new HeadObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
      });

      await r2.send(command);
      return true;
    } catch {
      return false;
    }
  }
}

export default new R2Service();