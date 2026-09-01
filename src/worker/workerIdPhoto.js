/*
 * A worker's own face, from the phone to their row of the register.
 *
 * Three steps, and the order is the point:
 *
 *   1. the ticket   worker_id_photo_ticket, against the session token the
 *                   sign-up just handed back. This is why nothing here needs
 *                   a door open to the anonymous world — the photo goes up
 *                   AFTER registering, not as part of it.
 *   2. the upload   into worker_id_photos/<ticket>/, the only path in the
 *                   bucket that ticket opens, and only while it lives.
 *   3. the link     worker_set_my_photo writes it onto their own row, and
 *                   the database checks the link rather than trusting it.
 *
 * Kept out of WorkerCover because the cover's job is the two fields and the
 * button, and out of workerApi because that file is one function per RPC.
 */

import { dataUrlToBlob } from '../lib/image.js';
import { supabase } from '../lib/supabase.js';
import * as api from './workerApi.js';

/**
 * → the public URL the photo now lives at.
 *
 * Raises rather than answering null when it cannot. The caller decides what
 * that means, and for registration it means "you are registered, the picture
 * did not go" — which has to be SAID, because a worker who took a photo and
 * saw only "welcome" will believe the office has their face.
 */
export async function uploadIdPhoto(token, dataUrl) {
  if (!token || !dataUrl) throw new Error('nothing to upload');

  const ticket = await api.idPhotoTicket(token);
  if (!ticket) throw new Error('no upload ticket');

  // .jpg, because the storage rule insists on it — a bucket an anonymous
  // caller can write to is a bucket that will be handed something else.
  const path = `worker_id_photos/${ticket}/${Date.now()}.jpg`;
  const { error } = await supabase.storage.from('documents')
    .upload(path, dataUrlToBlob(dataUrl), { contentType: 'image/jpeg', upsert: true });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from('documents').getPublicUrl(path);
  const url = data && data.publicUrl;
  if (!url) throw new Error('the photo uploaded but has no link');

  await api.setMyPhoto(token, url);
  return url;
}
