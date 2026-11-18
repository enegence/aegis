/**
 * Names used for packets mirrored to S3-compatible storage.
 *
 * Kept free of the AWS SDK so routes can import the defaults cheaply.
 *
 * Packets mirrored before the rename live under the old default prefix
 * `aegis` with the suffix `.aegis.enc`. They are never looked up by
 * rebuilding a key: every upload stores its exact object key on the packet row
 * (`storage_object_key`), and verify, download and delete use that stored
 * key. An install that already saved a prefix keeps it in its settings. So
 * the names below only shape NEW uploads and cannot strand an existing object.
 */

/** Suffix of packet objects written to S3. */
export const PACKET_OBJECT_SUFFIX = '.underwing.enc';

/** Default key prefix offered to new installs. */
export const DEFAULT_S3_PREFIX = 'underwing';
