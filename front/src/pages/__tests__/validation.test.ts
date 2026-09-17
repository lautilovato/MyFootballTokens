import { describe, expect, it } from 'vitest';
import { validateLogin, validateRegister } from '../validation';

/** T042 / FR-017 / quickstart E9: nada sale a la red con el formulario invalido. */
describe('validacion previa al envio', () => {
  it('marca los campos obligatorios vacios en login', () => {
    const errors = validateLogin({ email: '', password: '' });
    expect(errors.email).toBeDefined();
    expect(errors.password).toBeDefined();
  });

  it('rechaza un email con formato invalido', () => {
    expect(validateLogin({ email: 'no-es-un-email', password: 'x' }).email).toBeDefined();
    expect(validateLogin({ email: 'ana@', password: 'x' }).email).toBeDefined();
  });

  it('acepta credenciales bien formadas', () => {
    expect(validateLogin({ email: 'ana@example.com', password: 'x' })).toEqual({});
  });

  it('exige los tres campos y 8 caracteres de contrasena en registro', () => {
    const errors = validateRegister({ email: '', username: '', password: 'corta' });
    expect(errors.email).toBeDefined();
    expect(errors.username).toBeDefined();
    expect(errors.password).toBeDefined();
  });

  it('no valida largo minimo en login, solo en registro', () => {
    // Una contrasena corta debe fallar como credencial invalida, no como
    // error de validacion (data-model.md #3).
    expect(validateLogin({ email: 'ana@example.com', password: 'abc' }).password).toBeUndefined();
    expect(validateRegister({ email: 'ana@example.com', username: 'ana', password: 'abc' }).password)
      .toBeDefined();
  });
});
