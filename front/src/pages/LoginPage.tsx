import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../components/AuthLayout';
import { Button } from '../components/Button';
import { FieldError } from '../components/FieldError';
import { Input } from '../components/Input';
import { useAuth } from '../services/useAuth';
import { validateLogin } from './validation';
import type { Errors } from './validation';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [values, setValues] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<Errors<typeof values>>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const found = validateLogin(values);
    setErrors(found);
    // Con errores no sale ninguna peticion de red (FR-017, quickstart E9).
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    setFormError('');
    try {
      await login(values.email, values.password);
      navigate('/');
    } catch {
      // Mensaje generico: el backend no distingue email inexistente de
      // contrasena incorrecta, y el cliente tampoco debe hacerlo (FR-008).
      setFormError('Credenciales invalidas');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Iniciar sesion">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        <Input
          label="Email"
          name="email"
          type="email"
          value={values.email}
          error={errors.email}
          onChange={(e) => setValues({ ...values, email: e.target.value })}
        />
        <Input
          label="Contrasena"
          name="password"
          type="password"
          value={values.password}
          error={errors.password}
          onChange={(e) => setValues({ ...values, password: e.target.value })}
        />
        <FieldError message={formError} />
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Entrando...' : 'Entrar'}
        </Button>
        <p className="text-center text-sm text-slate-400">
          No tenes cuenta?{' '}
          <Link to="/register" className="text-neon-blue hover:underline">
            Registrate
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
