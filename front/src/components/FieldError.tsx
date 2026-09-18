/** Rojo de alto contraste para errores de validacion (FR-026). */
export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm font-medium text-error-red">
      {message}
    </p>
  );
}
