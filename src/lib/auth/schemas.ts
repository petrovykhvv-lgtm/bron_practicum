import { z } from "zod";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Слишком длинный email")
  .pipe(z.email("Введите корректный email"));

// bcrypt учитывает только первые 72 байта пароля, поэтому длиннее не принимаем.
const password = z
  .string()
  .min(8, "Пароль должен быть не короче 8 символов")
  .refine((value) => new TextEncoder().encode(value).length <= 72, "Пароль слишком длинный (максимум 72 байта)");

export const registerSchema = z.object({
  email,
  name: z.string().trim().min(1, "Введите имя").max(80, "Слишком длинное имя"),
  password,
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Введите пароль").max(200),
});

export const roleChangeSchema = z.object({
  role: z.enum(["user", "admin", "super_admin"]),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
