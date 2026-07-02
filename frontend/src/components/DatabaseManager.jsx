import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import '../styles/databaseManager.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function getValue(doc, path) {
  return path.split('.').reduce((value, part) => {
    if (!value || typeof value !== 'object') return '';
    return value[part] ?? '';
  }, doc);
}

function setValue(target, path, value) {
  const parts = path.split('.');
  let cursor = target;
  parts.forEach((part, index) => {
    if (index === parts.length - 1) {
      cursor[part] = value;
      return;
    }
    cursor[part] = cursor[part] && typeof cursor[part] === 'object' ? cursor[part] : {};
    cursor = cursor[part];
  });
}

function normalizeValue(field, value) {
  if (field.type === 'boolean') return Boolean(value);
  if (field.type === 'number') return value === '' ? '' : Number(value);
  if (field.type === 'list') {
    if (Array.isArray(value)) return value;
    return String(value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return value;
}

function buildFormDocument(fields, values) {
  const doc = {};
  fields.forEach((field) => {
    const raw = values[field.name];
    if (raw === undefined || raw === '') return;
    setValue(doc, field.name, normalizeValue(field, raw));
  });
  return doc;
}

function formValuesFromDocument(fields, doc) {
  const values = {};
  fields.forEach((field) => {
    const value = getValue(doc, field.name);
    if (field.type === 'list' && Array.isArray(value)) {
      values[field.name] = value.join(', ');
    } else {
      values[field.name] = value ?? '';
    }
  });
  return values;
}

function compactValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function DatabaseManager() {
  const navigate = useNavigate();
  const location = useLocation();
  const adminEmail = localStorage.getItem('user_email') || '';
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingRole, setCheckingRole] = useState(true);
  const [collections, setCollections] = useState([]);
  const [selectedKey, setSelectedKey] = useState('');
  const [documents, setDocuments] = useState([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [formValues, setFormValues] = useState({});
  const [editingDoc, setEditingDoc] = useState(null);
  const [busy, setBusy] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const selectedCollection = useMemo(
    () => collections.find((item) => item.key === selectedKey),
    [collections, selectedKey]
  );

  useEffect(() => {
    if (!localStorage.getItem('user_id')) {
      const returnTo = `${location.pathname}${location.search}`;
      sessionStorage.setItem('post_login_redirect', returnTo);
      navigate('/login', { replace: true, state: { returnTo } });
      return;
    }

    async function loadRole() {
      try {
        const response = await fetch(`${API_URL}/me/role?email=${encodeURIComponent(adminEmail)}`);
        const role = await response.json();
        setIsAdmin(Boolean(role.is_admin));
      } catch {
        setError('Could not check admin access.');
      } finally {
        setCheckingRole(false);
      }
    }

    loadRole();
  }, [adminEmail, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (!isAdmin) return;
    async function loadCollections() {
      setError('');
      const response = await fetch(
        `${API_URL}/admin/database/collections?admin_email=${encodeURIComponent(adminEmail)}`
      );
      if (!response.ok) throw new Error('Could not load database sections.');
      const data = await response.json();
      setCollections(data.collections || []);
      setSelectedKey((data.collections && data.collections[0]?.key) || '');
    }

    loadCollections().catch((err) => setError(err.message));
  }, [adminEmail, isAdmin]);

  useEffect(() => {
    if (!selectedKey || !isAdmin) return;
    loadDocuments();
    resetForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey, isAdmin]);

  async function loadDocuments(nextSearch = search) {
    if (!selectedKey) return;
    setBusy(true);
    setError('');
    try {
      const params = new URLSearchParams({
        admin_email: adminEmail,
        search: nextSearch,
        limit: '100',
      });
      const response = await fetch(`${API_URL}/admin/database/${selectedKey}?${params.toString()}`);
      if (!response.ok) {
        const problem = await response.json().catch(() => ({}));
        throw new Error(problem.detail || 'Could not load entries.');
      }
      const data = await response.json();
      setDocuments(data.documents || []);
      const nextTotal = data.total || 0;
      setTotal(nextTotal);
      setCollections((current) => (
        current.map((item) => (
          item.key === selectedKey ? { ...item, count: nextTotal } : item
        ))
      ));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function resetForm() {
    setEditingDoc(null);
    setNotice('');
    setError('');
    const values = {};
    (selectedCollection?.fields || []).forEach((field) => {
      if (field.name === 'created_by') {
        values[field.name] = adminEmail;
      } else if (field.name === 'status') {
        values[field.name] = 'active';
      } else if (field.name === 'active') {
        values[field.name] = true;
      } else {
        values[field.name] = field.type === 'boolean' ? false : '';
      }
    });
    setFormValues(values);
  }

  function editDocument(doc) {
    setEditingDoc(doc);
    setNotice('');
    setError('');
    setFormValues(formValuesFromDocument(selectedCollection.fields, doc));
  }

  function updateField(field, value) {
    setFormValues((current) => ({ ...current, [field.name]: value }));
  }

  async function saveDocument(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const document = buildFormDocument(selectedCollection.fields, formValues);
      const target = editingDoc
        ? `${API_URL}/admin/database/${selectedKey}/${editingDoc.id}?admin_email=${encodeURIComponent(adminEmail)}`
        : `${API_URL}/admin/database/${selectedKey}?admin_email=${encodeURIComponent(adminEmail)}`;
      const response = await fetch(target, {
        method: editingDoc ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document }),
      });
      if (!response.ok) {
        const problem = await response.json().catch(() => ({}));
        throw new Error(problem.detail || 'Could not save entry.');
      }
      setNotice(editingDoc ? 'Entry updated.' : 'Entry added.');
      resetForm();
      await loadDocuments();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteDocument(doc) {
    const label = doc._display_title || doc.id;
    if (!window.confirm(`Delete "${label}"? This removes the entry from the database.`)) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(
        `${API_URL}/admin/database/${selectedKey}/${doc.id}?admin_email=${encodeURIComponent(adminEmail)}`,
        { method: 'DELETE' }
      );
      if (!response.ok) {
        const problem = await response.json().catch(() => ({}));
        throw new Error(problem.detail || 'Could not delete entry.');
      }
      setNotice('Entry deleted.');
      if (editingDoc?.id === doc.id) resetForm();
      await loadDocuments();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function importAllowedEmails(event) {
    event.preventDefault();
    if (!bulkText.trim()) {
      setError('Paste at least one email first.');
      return;
    }

    setBulkBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(
        `${API_URL}/admin/database/allowed-emails/import?admin_email=${encodeURIComponent(adminEmail)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: bulkText }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || 'Could not import emails.');
      }
      setBulkText('');
      setNotice(
        `Imported ${data.total} email${data.total === 1 ? '' : 's'}: ${data.added} added, ${data.updated} updated, ${data.unchanged} unchanged.`
      );
      await loadDocuments();
    } catch (err) {
      setError(err.message);
    } finally {
      setBulkBusy(false);
    }
  }

  if (checkingRole) {
    return (
      <div className="db-page db-center">
        <i className="fas fa-spinner fa-spin"></i>
        <span>Checking access...</span>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="db-page db-denied">
        <button className="db-back" onClick={() => navigate('/dashboard')}>
          <i className="fas fa-arrow-left"></i>
          Dashboard
        </button>
        <h1>Database Manager</h1>
        <p>Your account is not on the admin list.</p>
      </div>
    );
  }

  return (
    <div className="db-page">
      <header className="db-header">
        <button className="db-back" onClick={() => navigate('/dashboard')}>
          <i className="fas fa-arrow-left"></i>
          Dashboard
        </button>
        <div>
          <p className="db-kicker">Admin tools</p>
          <h1>Database Manager</h1>
        </div>
        <div className="db-admin-pill">
          <i className="fas fa-shield-halved"></i>
          {adminEmail}
        </div>
      </header>

      <main className="db-layout">
        <aside className="db-sidebar" aria-label="Database sections">
          {collections.map((collection) => (
            <button
              key={collection.key}
              className={`db-section-button ${collection.key === selectedKey ? 'active' : ''}`}
              onClick={() => setSelectedKey(collection.key)}
            >
              <span>{collection.label}</span>
              <strong>{collection.count}</strong>
            </button>
          ))}
        </aside>

        <section className="db-workspace">
          {selectedCollection && (
            <>
              <div className="db-toolbar">
                <div>
                  <h2>{selectedCollection.label}</h2>
                  <p>{selectedCollection.description}</p>
                </div>
                <form
                  className="db-search"
                  onSubmit={(event) => {
                    event.preventDefault();
                    loadDocuments(search);
                  }}
                >
                  <i className="fas fa-search"></i>
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search entries"
                  />
                  <button type="submit">Search</button>
                </form>
              </div>

              {(error || notice) && (
                <div className={`db-message ${error ? 'error' : 'success'}`}>
                  {error || notice}
                </div>
              )}

              {selectedKey === 'allowed_emails' && (
                <section className="db-import-panel">
                  <div className="db-panel-heading">
                    <div>
                      <h3>Paste email table</h3>
                      <span>Copy rows from Excel or Google Sheets, then import them here.</span>
                    </div>
                  </div>
                  <form className="db-import-form" onSubmit={importAllowedEmails}>
                    <textarea
                      value={bulkText}
                      onChange={(event) => setBulkText(event.target.value)}
                      placeholder={'student@connect.ust.hk\tStudent Name\nanother@ust.hk\tAnother Student'}
                    />
                    <button className="db-primary" disabled={bulkBusy} type="submit">
                      <i className={`fas ${bulkBusy ? 'fa-spinner fa-spin' : 'fa-file-import'}`}></i>
                      {bulkBusy ? 'Importing...' : 'Import emails'}
                    </button>
                  </form>
                </section>
              )}

              <div className="db-content-grid">
                <section className="db-form-panel">
                  <div className="db-panel-heading">
                    <h3>{editingDoc ? 'Edit entry' : 'Add entry'}</h3>
                    {editingDoc && (
                      <button className="db-link-button" onClick={resetForm} type="button">
                        New entry
                      </button>
                    )}
                  </div>
                  <form onSubmit={saveDocument} className="db-entry-form">
                    {selectedCollection.fields.map((field) => {
                      if (editingDoc && field.create_only) return null;
                      const value = formValues[field.name] ?? '';
                      return (
                        <label className="db-field" key={field.name}>
                          <span>
                            {field.label}
                            {field.required && <b>Required</b>}
                          </span>
                          {field.type === 'textarea' ? (
                            <textarea
                              value={value}
                              required={field.required}
                              placeholder={field.placeholder || ''}
                              onChange={(event) => updateField(field, event.target.value)}
                            />
                          ) : field.type === 'boolean' ? (
                            <label className="db-toggle">
                              <input
                                type="checkbox"
                                checked={Boolean(value)}
                                onChange={(event) => updateField(field, event.target.checked)}
                              />
                              <span>{value ? 'Yes' : 'No'}</span>
                            </label>
                          ) : (
                            <input
                              value={value}
                              type={field.type === 'list' ? 'text' : field.type}
                              required={field.required}
                              placeholder={field.placeholder || ''}
                              onChange={(event) => updateField(field, event.target.value)}
                            />
                          )}
                          {field.help && <small>{field.help}</small>}
                        </label>
                      );
                    })}
                    <button className="db-primary" disabled={busy} type="submit">
                      <i className={`fas ${editingDoc ? 'fa-floppy-disk' : 'fa-plus'}`}></i>
                      {editingDoc ? 'Save changes' : 'Add entry'}
                    </button>
                  </form>
                </section>

                <section className="db-list-panel">
                  <div className="db-panel-heading">
                    <h3>Entries</h3>
                    <span>{documents.length} shown of {total}</span>
                  </div>
                  <div className="db-entry-list">
                    {busy && <div className="db-empty">Loading...</div>}
                    {!busy && documents.length === 0 && <div className="db-empty">No entries found.</div>}
                    {!busy && documents.map((doc) => (
                      <article className="db-entry-row" key={doc.id}>
                        <div className="db-entry-main">
                          <h4>{doc._display_title}</h4>
                          <dl>
                            {selectedCollection.fields.slice(0, 5).map((field) => (
                              <div key={field.name}>
                                <dt>{field.label}</dt>
                                <dd>{compactValue(getValue(doc, field.name))}</dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                        <div className="db-row-actions">
                          <button type="button" onClick={() => editDocument(doc)}>
                            <i className="fas fa-pen"></i>
                            Edit
                          </button>
                          <button type="button" className="danger" onClick={() => deleteDocument(doc)}>
                            <i className="fas fa-trash"></i>
                            Delete
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

export default DatabaseManager;
