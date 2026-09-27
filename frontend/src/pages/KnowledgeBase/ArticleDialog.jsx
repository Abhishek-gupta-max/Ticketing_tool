import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import Modal from '../../components/common/Modal';
import { Field, Input, Textarea, Select } from '../../components/forms/Field';
import { useForm, useMeta, withMeta } from '../../hooks';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { kbService } from '../../services/assetService';

function ArticleDialog({ article, onClose }) {
  const meta = useMeta();
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const edit = !!article;
  const f = useForm({ title: article?.title || '', categoryId: article?.category.id || meta?.kbCategories.find((c) => c.name === 'Software and apps')?.id || meta?.kbCategories[0]?.id, audience: article?.audience || 'Public', tags: (article?.tags || []).join(', '), body: article?.body || '' });
  const [busy, setBusy] = useState(false);

  const save = async (status) => {
    const e = {};
    if (f.values.title.trim().length < 5) e.title = 'Title needs at least 5 characters.';
    if (f.values.body.trim().length < 10) e.body = 'Add some content.';
    if (Object.keys(e).length) return f.setErrors(e);
    const body = { title: f.values.title.trim(), categoryId: Number(f.values.categoryId), audience: f.values.audience, status, body: f.values.body.trim(), tags: f.values.tags.split(',').map((x) => x.trim()).filter(Boolean) };
    setBusy(true);
    try {
      const res = edit ? await kbService.update(article.number, body) : await kbService.create(body);
      qc.invalidateQueries({ queryKey: ['kb'] });
      toast(edit ? 'Article saved' : `${res.data.number} ${status === 'Published' ? 'published' : 'saved as draft'}`);
      onClose();
      if (!edit) navigate(`/kb/${res.data.number}`);
    } catch (err) { f.fromError(err); toast(err.message); } finally { setBusy(false); }
  };

  const keep = article?.status || 'Draft';
  const buttons = [{ label: 'Cancel', onClick: onClose }, { label: 'Save as draft', onClick: () => save('Draft') }];
  if (can('kb:publish')) buttons.push({ label: 'Publish', variant: 'primary', type: 'submit' });
  else if (edit) buttons.push({ label: 'Save', variant: 'primary', onClick: () => save(keep) });

  return (
    <Modal title={edit ? 'Edit article' : 'New article'} wide onClose={onClose} busy={busy} onSubmit={() => save('Published')} buttons={buttons}>
      <Field label="Title" error={f.errors.title}>{(id) => <Input id={id} placeholder="How do I...?" {...f.bind('title')} />}</Field>
      <div className="row2">
        <Field label="Category">{(id) => <Select id={id} options={(meta?.kbCategories || []).map((c) => [c.id, c.name])} {...f.bind('categoryId')} />}</Field>
        <Field label="Audience">{(id) => <Select id={id} options={[['Public', 'Public'], ['Internal', 'Internal (agents only)']]} {...f.bind('audience')} />}</Field>
      </div>
      <Field label="Tags separated by commas">{(id) => <Input id={id} {...f.bind('tags')} />}</Field>
      <Field label="Content" error={f.errors.body} hint='Use "## Heading", "1. steps", "- bullets", **bold** and `code`.'>{(id) => <Textarea id={id} style={{ minHeight: 220 }} {...f.bind('body')} />}</Field>
    </Modal>
  );
}

export default withMeta(ArticleDialog);
