import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthLayout } from '../components/AuthLayout';
import { Button } from '../components/Button';
import { FieldError } from '../components/FieldError';
import { Input } from '../components/Input';
import { useAuth } from '../services/useAuth';
import { validateRegister } from './validation';
import type { Errors, RegisterFields } from './validation';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [values, setValues] = useState<RegisterFields>({ email: '', username: '', password: '' });
  const [errors, setErrors] = useState<Errors<RegisterFields>>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const found = validateRegister(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    setFormError('');
    try {
      await register(values.email, values.username, values.password);
      navigate('/');
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      setFormError(
        status === 409 ? 'Ya existe una cuenta con ese email' : 'No se pudo completar el registro',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Crear cuenta">
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
          label="Nombre de usuario"
          name="username"
          value={values.username}
          error={errors.username}
          onChange={(e) => setValues({ ...values, username: e.target.value })}
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
          {submitting ? 'Creando...' : 'Crear cuenta'}
        </Button>
        <p className="text-center text-sm text-slate-400">
          Ya tenes cuenta?{' '}
          <Link to="/login" className="text-neon-blue hover:underline">
            Inicia sesion
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
