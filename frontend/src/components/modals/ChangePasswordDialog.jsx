import Modal from '../common/Modal';
import { Field, Input } from '../forms/Field';
import { useForm, useAction } from '../../hooks';
import { authService } from '../../services/authService';
import { passwordProblem } from '../../validators';

export default function ChangePasswordDialog({ onClose }) {
  const f = useForm({ current: '', next: '', confirm: '' });
  const act = useAction(() => authService.changePassword(f.values.current, f.values.next), { onSuccess: onClose, onError: (e) => { f.setErrors({ current: e.message }); return false; } });
  const submit = () => {
    const p = passwordProblem(f.values.next);
    if (p) return f.setErrors({ next: p });
    if (f.values.next !== f.values.confirm) return f.setErrors({ confirm: 'The passwords do not match.' });
    act.mutate();
  };
  return (
    <Modal title="Change password" onClose={onClose} onSubmit={submit} busy={act.isPending}
      buttons={[{ label: 'Cancel', onClick: onClose }, { label: 'Change password', variant: 'primary', type: 'submit' }]}>
      <Field label="Current password" error={f.errors.current}>{(id) => <Input id={id} type="password" autoComplete="current-password" {...f.bind('current')} />}</Field>
      <Field label="New password" error={f.errors.next} hint="At least 10 characters with a letter and a number.">{(id) => <Input id={id} type="password" autoComplete="new-password" {...f.bind('next')} />}</Field>
      <Field label="Confirm new password" error={f.errors.confirm}>{(id) => <Input id={id} type="password" autoComplete="new-password" {...f.bind('confirm')} />}</Field>
    </Modal>
  );
}
