/** Validacion previa al envio: ninguna peticion sale con el formulario invalido (FR-017). */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface RegisterFields {
  email: string;
  username: string;
  password: string;
}

export type Errors<T> = Partial<Record<keyof T, string>>;

export function validateLogin(values: { email: string; password: string }) {
  const errors: Errors<typeof values> = {};
  if (!values.email.trim()) errors.email = 'El email es obligatorio';
  else if (!EMAIL_PATTERN.test(values.email)) errors.email = 'El email no tiene un formato valido';
  if (!values.password) errors.password = 'La contrasena es obligatoria';
  return errors;
}

export function validateRegister(values: RegisterFields) {
  const errors: Errors<RegisterFields> = {};
  if (!values.email.trim()) errors.email = 'El email es obligatorio';
  else if (!EMAIL_PATTERN.test(values.email)) errors.email = 'El email no tiene un formato valido';
  if (!values.username.trim()) errors.username = 'El nombre de usuario es obligatorio';
  if (!values.password) errors.password = 'La contrasena es obligatoria';
  else if (values.password.length < 8) errors.password = 'Debe tener al menos 8 caracteres';
  return errors;
}
