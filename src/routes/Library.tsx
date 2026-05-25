import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2, ListChecks, Sparkles } from 'lucide-react';
import { deletePattern, listSummaries, type PatternSummary } from '../lib/storage';

export function Library() {
  const [items, setItems] = useState<PatternSummary[] | null>(null);
  const [toDelete, setToDelete] = useState<PatternSummary | null>(null);

  const refresh = () => listSummaries().then(setItems);
  useEffect(() => {
    refresh();
  }, []);

  return (
    <section className="stack gap-3">
      <div className="row gap-2 wrap" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">
            <span className="script">Your</span>
            Library
          </h1>
          <p className="muted" style={{ marginTop: '0.25rem' }}>
            A keepsake gallery of every pattern you've made.
          </p>
        </div>
        <Link to="/create" className="btn btn-primary">
          <Plus size={18} /> New pattern
        </Link>
      </div>

      {items === null && <p className="muted">Loading…</p>}

      {items && items.length === 0 && (
        <div className="empty">
          <Sparkles size={28} color="var(--mauve)" />
          <h3 style={{ marginTop: '0.5rem' }}>No patterns yet</h3>
          <p className="muted">
            Upload a photo and craft your first cross stitch pattern.
          </p>
          <Link to="/create" className="btn btn-primary" style={{ marginTop: '0.75rem' }}>
            <Plus size={18} /> Create one
          </Link>
        </div>
      )}

      {items && items.length > 0 && (
        <div className="library-grid">
          {items.map((p) => {
            const pct = p.totalNonBlank === 0 ? 0 : Math.round((p.completed / p.totalNonBlank) * 100);
            return (
              <article key={p.id} className="card card-hover library-card">
                <Link to={`/pattern/${p.id}`} aria-label={`Open ${p.name}`}>
                  <img src={p.thumbnail} alt="" className="library-thumb" />
                </Link>
                <div className="library-body">
                  <div className="library-title">{p.name || 'Untitled'}</div>
                  <div className="row gap-2" style={{ justifyContent: 'space-between' }}>
                    <span className="badge">
                      {p.gridW}×{p.gridH}
                    </span>
                    <span className="muted" style={{ fontSize: '0.85rem' }}>{pct}% complete</span>
                  </div>
                  <div className="progress" aria-hidden>
                    <span style={{ width: `${pct}%` }} />
                  </div>
                  <div className="library-actions">
                    <Link to={`/pattern/${p.id}`} className="btn btn-sm btn-primary">
                      Open
                    </Link>
                    <Link to={`/pattern/${p.id}/shopping`} className="btn btn-sm btn-secondary">
                      <ListChecks size={14} /> Shopping
                    </Link>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() => setToDelete(p)}
                      aria-label={`Delete ${p.name}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {toDelete && (
        <div className="modal-overlay" role="dialog" aria-modal>
          <div className="modal stack gap-2">
            <h3>Delete pattern?</h3>
            <p className="muted">
              "{toDelete.name}" will be permanently removed from your library.
            </p>
            <div className="row gap-2" style={{ justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setToDelete(null)}>
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={async () => {
                  await deletePattern(toDelete.id);
                  setToDelete(null);
                  refresh();
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
