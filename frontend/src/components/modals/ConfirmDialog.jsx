import Modal from '../common/Modal';

export default function ConfirmDialog({ title, message, confirmLabel = 'Confirm', danger = false, onClose }) {
  return (
    <Modal
      title={title}
      onClose={() => onClose(false)}
      onSubmit={() => onClose(true)}
      buttons={[
        { label: 'Cancel', onClick: () => onClose(false) },
        { label: confirmLabel, variant: danger ? 'danger' : 'primary', type: 'submit' },
      ]}
    >
      <p>{message}</p>
    </Modal>
  );
}
