import bcrypt from "bcryptjs";

export const BCRYPT_SALT_ROUNDS = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

export function verifyPassword(inputPassword: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(inputPassword, passwordHash);
}
