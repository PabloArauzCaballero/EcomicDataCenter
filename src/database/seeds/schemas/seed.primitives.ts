import { z } from 'zod';

/** Field shapes shared by every seed catalog, kept in one place so the boot and
 * synthetic schemas cannot drift apart in what they accept. */
export const uuid = z.string().uuid();
export const date = z.iso.date();
export const code = (maximum: number) => z.string().trim().min(1).max(maximum);
export const nullableText = (maximum: number) => z.string().trim().min(1).max(maximum).nullable();
