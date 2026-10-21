import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const formatDate = (dateString) => {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const getBadgeClass = (statut) => {
  const s = statut.toLowerCase();
  if (s.includes('créée') || s === 'en attente') return 'badge-gray';
  if (s === 'lancée') return 'badge-blue';
  if (s === 'modifié') return 'badge-yellow';
  if (s === 'préparée' || s === 'livrée') return 'badge-orange';
  if (s === 'réceptionnée') return 'badge-green';
  if (s.includes('partiel') || s.includes('non') || s === 'écart') return 'badge-red';
  return 'badge-gray';
};

function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('');

  if (!user) return <Login onLogin={(u) => { setUser(u); setView(u.role === 'admin' ? 'dashboard' : u.role); }} />;

  const handleLogout = async () => {
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.access_token}` }
      });
      if (!response.ok) throw new Error();
    } catch {
      alert("La déconnexion sécurisée a échoué. Veuillez contacter l'administrateur.");
    } finally {
      setUser(null);
      setView('');
    }
  };

  return (
    <div className="container">
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem'}}>
        <h1>Gestion ERP des Flux Matière</h1>
        <div style={{fontSize: '1.2rem', color: '#6b7280'}}>
          Connecté: <strong>{user.username}</strong> ({user.role}) 
          <button className="btn-sm btn-outline" style={{marginLeft: '1rem'}} onClick={handleLogout}>Déconnexion</button>
        </div>
      </div>
      
      <div className="nav">
        {(user.role === 'admin' || user.role === 'planificateur') && <button className={view === 'dashboard' ? 'active' : ''} onClick={() => setView('dashboard')}>📊 Dashboard KPI</button>}
        {(user.role === 'admin' || user.role === 'planificateur') && <button className={view === 'planificateur' ? 'active' : ''} onClick={() => setView('planificateur')}>👨‍💻 Planificateur</button>}
        {(user.role === 'admin' || user.role === 'magasinier') && <button className={view === 'magasinier' ? 'active' : ''} onClick={() => setView('magasinier')}>📦 Magasinier</button>}
        {(user.role === 'admin' || user.role === 'coupeur') && <button className={view === 'coupeur' ? 'active' : ''} onClick={() => setView('coupeur')}>✂️ Coupe</button>}
        {user.role === 'admin' && <button className={view === 'admin' ? 'active' : ''} onClick={() => setView('admin')}>⚙️ Administration</button>}
      </div>
      
      {view === 'dashboard' && <Dashboard />}
      {view === 'planificateur' && <Planificateur />}
      {view === 'magasinier' && <Magasinier />}
      {view === 'coupeur' && <Coupeur />}
      {view === 'admin' && user.role === 'admin' && <AdminPanel token={user.access_token} />}
    </div>
  );
}

function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = (e) => {
    e.preventDefault();
    fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) })
    .then(async res => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);
      onLogin(data);
    }).catch(err => alert(err.message));
  };

  return (
    <main className="login-page">
      <div className="login-card">
        <section className="login-brand-panel">
          <div className="login-brand-content">
            <img className="login-brand-logo" src="/sage-logo-white.png" alt="SAGE Automotive Interiors" />
            <div className="login-brand-rule" />
            <p className="login-brand-eyebrow">Gestion industrielle</p>
            <h1>Flux<br />Matière</h1>
            <p className="login-brand-description">
              Système de gestion des flux matière et de préparation des opérations de coupe automobile.
            </p>
            <ul className="login-feature-list">
              <li>Suivi des demandes en temps réel</li>
              <li>Traçabilité des matières</li>
              <li>Pilotage des opérations de coupe</li>
              <li>Gestion des stocks et surplus</li>
            </ul>
          </div>
        </section>
        <section className="login-form-panel">
          <div className="login-form-content">
            <div className="login-heading">
              <span className="login-heading-mark" aria-hidden="true" />
              <h2>Connexion</h2>
              <p>Entrez vos identifiants pour accéder au système</p>
            </div>
            <form className="login-form" onSubmit={handleLogin}>
              <label htmlFor="login-username">Identifiant</label>
              <div className="login-input-wrap">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" />
                </svg>
                <input
                  id="login-username"
                  autoComplete="username"
                  placeholder="Votre identifiant"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  required
                />
              </div>
              <label htmlFor="login-password">Mot de passe</label>
              <div className="login-input-wrap">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="4" y="10" width="16" height="11" rx="2" />
                  <path d="M8 10V7a4 4 0 1 1 8 0v3" />
                </svg>
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
                <button
                  className="login-password-toggle"
                  type="button"
                  aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  onClick={() => setShowPassword(visible => !visible)}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </button>
              </div>
              <button type="submit" className="login-submit">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M10 17l5-5-5-5M15 12H3m9-9h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7" />
                </svg>
                Se connecter
              </button>
            </form>
            <p className="login-footer">SAGE Automotive Interiors — Flux Matière v13</p>
          </div>
        </section>
      </div>
    </main>
  );
}

function Dashboard() {
  const [kpi, setKpi] = useState({ avg_lead_time_minutes: 0, total_partielles: 0, total_receptions: 0, metrage_livre: 0, total_claims: 0 });
  const [period, setPeriod] = useState('all');

  useEffect(() => {
    fetch(`/api/kpi/dashboard?period=${period}`).then(res => res.json()).then(setKpi);
  }, [period]);

  return (
    <div>
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem'}}>
        <h2 style={{margin:0}}>Indicateurs de Performance</h2>
        <select value={period} onChange={e => setPeriod(e.target.value)} style={{fontSize: '1.4rem', fontWeight: 'bold'}}>
          <option value="all">Toutes les périodes</option>
          <option value="today">Aujourd'hui</option>
          <option value="week">Cette semaine</option>
          <option value="month">Ce mois-ci</option>
          <option value="last_month">Mois dernier</option>
        </select>
      </div>
      
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-title">Lead Time Moyen</div>
          <div className="kpi-value">{kpi.avg_lead_time_minutes} min</div>
          <div style={{color: '#6b7280', fontSize: '1.1rem'}}>De la création à la réception</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-title">Réceptions Partiel.</div>
          <div className="kpi-value" style={{color: '#ef4444'}}>{kpi.total_partielles} <span style={{fontSize:'1.5rem'}}>/ {kpi.total_receptions}</span></div>
          <div style={{color: '#6b7280', fontSize: '1.1rem'}}>Anomalies de réception</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-title">Métrage Livré</div>
          <div className="kpi-value" style={{color: '#10b981'}}>{kpi.metrage_livre} m</div>
          <div style={{color: '#6b7280', fontSize: '1.1rem'}}>Tissus validés par la coupe</div>
        </div>
        <div className="kpi-card" style={{borderColor: '#fca5a5', backgroundColor: '#fef2f2'}}>
          <div className="kpi-title" style={{color: '#991b1b'}}>Claims / Reliquats</div>
          <div className="kpi-value" style={{color: '#dc2626'}}>{kpi.total_claims}</div>
          <div style={{color: '#991b1b', fontSize: '1.1rem'}}>Générés suite à écart</div>
        </div>
      </div>
    </div>
  );
}

const DemandesTable = ({ demandes, role, chargerDemandes }) => {
  const [expandedIds, setExpandedIds] = useState([]);
  const [demandeAImprimer, setDemandeAImprimer] = useState(null);
  const toggleExpand = (id) => setExpandedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  useEffect(() => {
    if (demandeAImprimer) {
      window.print();
      setDemandeAImprimer(null);
    }
  }, [demandeAImprimer]);

  const updateLigne = (ligneId, endpoint, payload) => {
    fetch(`/api/lignes/${ligneId}/${endpoint}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    .then(() => chargerDemandes());
  };

  const actionGlobale = (id, actionType) => {
    fetch(`/api/demandes/${id}/action_globale`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: actionType }) })
    .then(() => chargerDemandes());
  };

  const supprimerDemande = (id) => {
    if(window.confirm("Supprimer cette demande de la base ?")) {
      fetch(`/api/demandes/${id}`, { method: 'DELETE' }).then(async res => {
          if (!res.ok) { const d = await res.json(); alert(d.detail); }
          chargerDemandes();
      });
    }
  };

  if (demandes.length === 0) return <p style={{fontStyle: 'italic', textAlign: 'center', fontSize: '1.4rem', color: '#6b7280', marginTop: '2rem'}}>Aucune demande à afficher.</p>;

  return (
    <>
    <table className="main-table">
      <thead>
        <tr>
          <th>ID</th>
          <th>Projet</th>
          <th>Véhicule</th>
          <th>Qté (Kits)</th>
          <th>Création</th>
          <th>Lancement</th>
          <th>Préparation</th>
          <th>Réception</th>
          <th>Statut</th>
        </tr>
      </thead>
      <tbody>
        {demandes.map(d => (
          <React.Fragment key={d.id}>
            <tr className="clickable-row" onClick={() => toggleExpand(d.id)}>
              <td>
                <strong>#{d.id}</strong> 
                {d.is_speciale && !d.parent_id && <span className="badge-ds">DS</span>}
                {d.parent_id && <span className="badge-claim">CLAIM</span>}
              </td>
              <td>{d.projet.toUpperCase()}</td><td>{d.vehicule}</td><td><strong>{d.quantite_vehicules}</strong></td>
              <td style={{fontSize: '1.1rem'}}>{formatDate(d.date_creation)}</td>
              <td style={{fontSize: '1.1rem'}}>{formatDate(d.date_lancement)}</td>
              <td style={{fontSize: '1.1rem'}}>{formatDate(d.date_preparation)}</td>
              <td style={{fontSize: '1.1rem'}}>{formatDate(d.date_reception)}</td>
              <td>
                 <span style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px'}}>
                    <span style={{display: 'flex', alignItems: 'center'}}>
                      {(role === 'planificateur' || role === 'admin') && (
                        <button className="btn-icon text-danger" onClick={(e) => { e.stopPropagation(); supprimerDemande(d.id); }} title="Supprimer">🗑️</button>
                      )}
                      <button className="btn-sm btn-outline" onClick={(e) => { e.stopPropagation(); setDemandeAImprimer(d); }} title={`Imprimer la demande #${d.id}`}>
                        🖨️ Imprimer
                      </button>
                      <span className={`badge ${getBadgeClass(d.statut)}`}>{d.statut}</span>
                    </span>
                    <span style={{fontSize: '1.5rem', color: '#9ca3af'}}>{expandedIds.includes(d.id) ? '▴' : '▾'}</span>
                 </span>
              </td>
            </tr>
            {expandedIds.includes(d.id) && (
              <tr>
                <td colSpan="9" style={{padding: 0, borderBottom: 'none'}}>
                  <div className="expanded-container">
                    <h4 style={{textAlign: 'left', marginTop: 0, marginBottom: '1rem'}}>Détail des références</h4>
                    <table className="tissus-table">
                      <thead>
                        <tr>
                          <th>Référence</th><th>Abr-Tissu</th><th>Qté Standard (m)</th><th>Qté Demandée (m)</th>
                          {role !== 'planificateur' && <th>Qté Préparée (m)</th>}
                          {role === 'coupeur' && <th>Qté Reçue (m)</th>}
                          <th>Surplus Généré</th><th>Statut</th><th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.lignes.map(l => {
                          const isRed = l.statut === 'Non réceptionné' || l.quantite_receptionnee === 0;
                          return (
                            <tr key={l.id} className={isRed ? 'row-error' : ''}>
                              <td><strong>{l.ref_tissu}</strong></td>
                              <td style={{color: '#4b5563'}}>{l.abr_tissu}</td>
                              <td style={{color: '#6b7280'}}>{l.quantite_standard}</td>
                              
                              <td>{role === 'planificateur' && d.statut === 'Créée' ? (<input type="number" step="0.01" id={`plan-${l.id}`} defaultValue={l.quantite_demandee} style={{width: '90px'}} onClick={e => e.stopPropagation()} />) : ( l.quantite_demandee )}</td>
                              {role !== 'planificateur' && <td>{role === 'magasinier' && d.statut === 'Lancée' ? (<input type="number" step="0.01" id={`mag-${l.id}`} defaultValue={l.quantite_preparee !== null ? l.quantite_preparee : l.quantite_demandee} style={{width: '90px'}} onClick={e => e.stopPropagation()} />) : ( l.quantite_preparee !== null ? l.quantite_preparee : '-' )}</td>}
                              {role === 'coupeur' && <td>{['Lancée', 'Livrée'].includes(d.statut) && !['Réceptionnée', 'Partiellement réceptionné', 'Non réceptionné'].includes(l.statut) ? (<input type="number" step="0.01" id={`coup-${l.id}`} defaultValue={l.quantite_receptionnee !== null ? l.quantite_receptionnee : l.quantite_preparee} style={{width: '90px'}} onClick={e => e.stopPropagation()}/>) : ( l.quantite_receptionnee !== null ? l.quantite_receptionnee : '-' )}</td>}

                              <td style={{color: l.surplus_disponible > 0 ? '#10b981' : '#6b7280', fontWeight: 'bold'}}>{l.surplus_disponible > 0 ? `+ ${l.surplus_disponible}` : l.surplus_disponible < 0 ? l.surplus_disponible : '-'}</td>
                              <td><span className={`badge ${getBadgeClass(l.statut)}`}>{l.statut}</span></td>
                              
                              <td>
                                {role === 'planificateur' && d.statut === 'Créée' && <button className="btn-sm btn-warning" onClick={() => updateLigne(l.id, 'planificateur', { quantite_demandee: parseFloat(document.getElementById(`plan-${l.id}`).value) })}>MAJ Ligne</button>}
                                {role === 'magasinier' && d.statut === 'Lancée' && <button className="btn-sm btn-success" onClick={() => updateLigne(l.id, 'magasinier', { quantite_preparee: parseFloat(document.getElementById(`mag-${l.id}`).value) })}>✓ Prép.</button>}
                                {role === 'coupeur' && ['Lancée', 'Livrée'].includes(d.statut) && !['Réceptionnée', 'Partiellement réceptionné', 'Non réceptionné'].includes(l.statut) && <button className="btn-sm btn-success" onClick={() => updateLigne(l.id, 'coupeur', { quantite_receptionnee: parseFloat(document.getElementById(`coup-${l.id}`).value) })}>✓ Reçu</button>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    
                    <div style={{marginTop: '2rem', textAlign: 'right'}}>
                      {role === 'planificateur' && d.statut === 'Créée' && <button onClick={() => actionGlobale(d.id, 'lancer')} className="btn-primary">🚀 Lancer la demande</button>}
                      {role === 'magasinier' && d.statut === 'Lancée' && <button onClick={() => actionGlobale(d.id, 'livrer_tout')} className="btn-warning">🚚 Valider tout & Livrer</button>}
                      {role === 'coupeur' && ['Lancée', 'Livrée'].includes(d.statut) && <button onClick={() => actionGlobale(d.id, 'receptionner_tout')} className="btn-success">✅ Tout Réceptionner</button>}
                    </div>
                  </div>
                </td>
              </tr>
            )}
          </React.Fragment>
        ))}
      </tbody>
    </table>
    {demandeAImprimer && createPortal(
      <section className="print-demand">
        <h1>Demande de matière #{demandeAImprimer.id}</h1>
        <div className="print-demand-meta">
          <p><strong>Projet :</strong> {demandeAImprimer.projet.toUpperCase()}</p>
          <p><strong>Véhicule :</strong> {demandeAImprimer.vehicule}</p>
          <p><strong>Quantité de véhicules :</strong> {demandeAImprimer.quantite_vehicules}</p>
          <p><strong>Statut :</strong> {demandeAImprimer.statut}</p>
          <p><strong>Date de création :</strong> {formatDate(demandeAImprimer.date_creation)}</p>
          <p><strong>Date de lancement :</strong> {formatDate(demandeAImprimer.date_lancement)}</p>
        </div>
        <table className="print-demand-table">
          <thead>
            <tr>
              <th>Référence</th>
              <th>Abr-Tissu</th>
              <th>Qté demandée (m)</th>
              <th>Qté préparée (m)</th>
            </tr>
          </thead>
          <tbody>
            {demandeAImprimer.lignes.map(ligne => (
              <tr key={ligne.id}>
                <td>{ligne.ref_tissu}</td>
                <td>{ligne.abr_tissu}</td>
                <td>{ligne.quantite_demandee}</td>
                <td>{ligne.quantite_preparee ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>,
      document.body
    )}
    </>
  );
};

function Planificateur() {
  const [projets, setProjets] = useState([]);
  const [vehicules, setVehicules] = useState([]);
  const [selectedProjet, setSelectedProjet] = useState('');
  const [selectedVehicule, setSelectedVehicule] = useState('');
  const [quantite, setQuantite] = useState(1);
  const [isSpeciale, setIsSpeciale] = useState(false);
  const [demandes, setDemandes] = useState([]);

  const chargerProjets = () => fetch('/api/nomenclatures/projets').then(res => res.json()).then(setProjets);
  const chargerDemandes = () => fetch('/api/demandes/').then(res => res.json()).then(setDemandes);

  useEffect(() => {
    chargerProjets(); chargerDemandes();
    const interval = setInterval(() => { chargerDemandes(); }, 30000);
    return () => clearInterval(interval);
  }, []);

  const creerDemande = () => {
    fetch('/api/demandes/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projet: selectedProjet, vehicule: selectedVehicule, quantite_vehicules: parseInt(quantite), is_speciale: isSpeciale }) })
    .then(() => { chargerDemandes(); setSelectedProjet(''); setSelectedVehicule(''); setQuantite(1); setIsSpeciale(false); });
  };

  return (
    <div>
      <div className="card">
        <h3 style={{textAlign: 'left', marginBottom: '1.5rem'}}>Créer une nouvelle demande</h3>
        <div className="creation-bar">
          <select value={selectedProjet} onChange={e => { setSelectedProjet(e.target.value); setSelectedVehicule(''); if(e.target.value) fetch(`/api/nomenclatures/vehicules/${e.target.value}`).then(res => res.json()).then(setVehicules); }} style={{flex: 1}}>
            <option value="">Sélectionner un projet</option>
            {projets.map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
          </select>
          <select value={selectedVehicule} onChange={e => setSelectedVehicule(e.target.value)} disabled={!selectedProjet} style={{flex: 1}}>
            <option value="">Sélectionner un véhicule</option>
            {vehicules.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          <input type="number" min="1" value={quantite} onChange={e => setQuantite(e.target.value)} placeholder="Qté Kits" style={{width: '100px'}} />
          <label style={{display: 'flex', alignItems: 'center', gap: '5px', color: '#dc2626', fontWeight: 'bold'}}>
            <input type="checkbox" checked={isSpeciale} onChange={e => setIsSpeciale(e.target.checked)} /> Demande Spéciale (DS)
          </label>
          <button onClick={creerDemande} disabled={!selectedVehicule || quantite < 1} className="btn-primary">➕ Créer</button>
        </div>
      </div>
      <h2>Suivi des demandes (Planificateur)</h2>
      <DemandesTable demandes={demandes} role="planificateur" chargerDemandes={chargerDemandes} />
    </div>
  );
}

function Magasinier() {
  const [demandes, setDemandes] = useState([]);
  const chargerDemandes = () => fetch('/api/demandes/').then(res => res.json()).then(data => setDemandes(data.filter(d => ['Lancée', 'Livrée'].includes(d.statut))));
  useEffect(() => { chargerDemandes(); const interval = setInterval(() => { chargerDemandes(); }, 30000); return () => clearInterval(interval); }, []);
  return <div><h2>Attente Préparation Magasin</h2><DemandesTable demandes={demandes} role="magasinier" chargerDemandes={chargerDemandes} /></div>;
}

function Coupeur() {
  const [demandes, setDemandes] = useState([]);
  const chargerDemandes = () => fetch('/api/demandes/').then(res => res.json()).then(data => setDemandes(data.filter(d => ['Lancée', 'Livrée', 'Réceptionnée', 'Partiellement réceptionnée'].includes(d.statut))));
  useEffect(() => { chargerDemandes(); const interval = setInterval(() => { chargerDemandes(); }, 30000); return () => clearInterval(interval); }, []);
  return <div><h2>Table de coupe - Réception matière</h2><DemandesTable demandes={demandes} role="coupeur" chargerDemandes={chargerDemandes} /></div>;
}

// === ADMINISTRATION ===
function AdminPanel({ token }) {
  const [tab, setTab] = useState('users');
  return (
    <div>
      <h2>Administration Système</h2>
      <div className="tab-nav">
        <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>👥 Utilisateurs</button>
        <button className={tab === 'noms' ? 'active' : ''} onClick={() => setTab('noms')}>📚 Nomenclatures</button>
      </div>
      {tab === 'users' && <AdminUsers token={token} />}
      {tab === 'noms' && <AdminNomenclatures />}
    </div>
  );
}

function AdminUsers({ token }) {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({username: '', password: '', role: 'planificateur'});
  const [editingId, setEditingId] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState('');
  const adminErrorMessage = "Une erreur est survenue. Veuillez contacter l'administrateur.";
  const adminHeaders = { Authorization: `Bearer ${token}` };
  const emptyForm = {username: '', password: '', role: 'planificateur'};

  const loadUsers = async () => {
    try {
      const response = await fetch('/api/users/', { headers: adminHeaders });
      if (!response.ok) throw new Error();
      setUsers(await response.json());
    } catch {
      alert(adminErrorMessage);
    } finally {
      setIsLoading(false);
    }
  };
  useEffect(() => { loadUsers(); }, []);

  const closeForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setIsFormOpen(false);
  };

  const saveUser = async () => {
    if (!form.username.trim() || (!editingId && !form.password)) {
      alert('Veuillez renseigner un identifiant et un mot de passe.');
      return;
    }
    setIsSaving(true);
    try {
      const isEditing = Boolean(editingId);
      const response = await fetch(isEditing ? `/api/users/${editingId}` : '/api/users/', {
        method: isEditing ? 'PUT' : 'POST',
        headers: { ...adminHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, username: form.username.trim() })
      });
      if (!response.ok) throw new Error();
      closeForm();
      await loadUsers();
    } catch {
      alert(adminErrorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const startEdit = (u) => {
    setEditingId(u.id);
    setForm({username: u.username, password: '', role: u.role});
    setIsFormOpen(true);
  };

  const startCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setIsFormOpen(true);
  };

  const deleteUser = async (id) => {
    if (!window.confirm("Supprimer l'utilisateur ?")) return;
    try {
      const response = await fetch(`/api/users/${id}`, { method: 'DELETE', headers: adminHeaders });
      if (!response.ok) throw new Error();
      await loadUsers();
    } catch {
      alert(adminErrorMessage);
    }
  };

  const roleLabels = {
    admin: 'Administrateur',
    planificateur: 'Planificateur',
    magasinier: 'Magasinier',
    coupeur: 'Coupeur'
  };
  const filteredUsers = users.filter(user =>
    `${user.username} ${roleLabels[user.role] || user.role}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="admin-users">
      <section className="admin-users-heading">
        <div>
          <h3>Gestion des utilisateurs</h3>
          <p>Créez les comptes et attribuez uniquement le rôle nécessaire.</p>
        </div>
        <button className="btn-primary" onClick={startCreate}>Ajouter un utilisateur</button>
      </section>

      {isFormOpen && (
        <form className="admin-user-form card" onSubmit={e => { e.preventDefault(); saveUser(); }}>
          <h4>{editingId ? 'Modifier le compte' : 'Nouveau compte'}</h4>
          <div className="admin-user-fields">
            <label>
              Identifiant
              <input
                autoComplete="off"
                maxLength="80"
                value={form.username}
                onChange={e => setForm({...form, username: e.target.value})}
                required
              />
            </label>
            <label>
              {editingId ? 'Nouveau mot de passe (facultatif)' : 'Mot de passe'}
              <input
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={e => setForm({...form, password: e.target.value})}
                required={!editingId}
              />
            </label>
            <label>
              Rôle
              <select value={form.role} onChange={e => setForm({...form, role: e.target.value})}>
                <option value="planificateur">Planificateur</option>
                <option value="magasinier">Magasinier</option>
                <option value="coupeur">Coupeur</option>
                <option value="admin">Administrateur</option>
              </select>
            </label>
          </div>
          <div className="admin-user-form-actions">
            <button type="submit" className="btn-success" disabled={isSaving}>
              {isSaving ? 'Enregistrement...' : editingId ? 'Enregistrer' : 'Créer le compte'}
            </button>
            <button type="button" className="btn-outline" onClick={closeForm} disabled={isSaving}>Annuler</button>
          </div>
        </form>
      )}

      <section className="admin-user-list card">
        <div className="admin-user-list-heading">
          <h4>Comptes ({users.length})</h4>
          <input
            type="search"
            aria-label="Rechercher un utilisateur"
            placeholder="Rechercher un compte..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {isLoading ? <p className="admin-user-status">Chargement des comptes...</p> : (
          <div className="admin-user-table-wrap">
            <table className="main-table">
              <thead><tr><th>Identifiant</th><th>Rôle</th><th>Actions</th></tr></thead>
              <tbody>
                {filteredUsers.map(user => (
                  <tr key={user.id}>
                    <td><strong>{user.username}</strong></td>
                    <td><span className="admin-role-badge">{roleLabels[user.role] || user.role}</span></td>
                    <td className="admin-user-actions">
                      <button className="btn-outline btn-sm" onClick={() => startEdit(user)}>Modifier</button>
                      <button className="btn-danger btn-sm" onClick={() => deleteUser(user.id)}>Supprimer</button>
                    </td>
                  </tr>
                ))}
                {!filteredUsers.length && <tr><td colSpan="3" className="admin-user-status">Aucun compte correspondant.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function AdminNomenclatures() {
  const [noms, setNoms] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const fileInputRef = useRef(null);
  
  const loadNoms = () => fetch('/api/nomenclatures/all').then(r => r.json()).then(setNoms);
  useEffect(() => { loadNoms(); }, []);

  const handleFileUpload = (e) => {
    const file = e.target.files[0]; if (!file) return;
    setIsUploading(true);
    const formData = new FormData(); formData.append("file", file);
    fetch('/api/nomenclatures/upload', { method: 'POST', body: formData })
    .then(async (res) => { const data = await res.json(); if (!res.ok) throw new Error(data.detail); return data; })
    .then(data => { alert(data.message); loadNoms(); })
    .catch(err => alert(err.message)).finally(() => setIsUploading(false));
    e.target.value = '';
  };

  const handleFileExport = async () => {
    setIsExporting(true);
    try {
      const response = await fetch('/api/nomenclatures/export');
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || "Échec de l'export Excel");
      }
      const fileUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = fileUrl;
      link.download = 'nomenclatures.xlsx';
      link.click();
      URL.revokeObjectURL(fileUrl);
    } catch (err) {
      alert(err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const deleteNom = (id) => { if(window.confirm("Supprimer ?")) fetch(`/api/nomenclatures/${id}`, {method: 'DELETE'}).then(loadNoms); };

  return (
    <div className="card">
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem'}}>
        <h3>Base des véhicules / Tissus</h3>
        <div style={{display: 'flex', alignItems: 'center', gap: '0.75rem'}}>
           <input ref={fileInputRef} type="file" accept=".xlsx, .xls" onChange={handleFileUpload} disabled={isUploading} style={{display: 'none'}}/>
           <button className="btn-primary" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>Importer Excel</button>
           <button className="btn-outline" onClick={handleFileExport} disabled={isExporting}>{isExporting ? 'Export...' : 'Exporter Excel'}</button>
           {isUploading && <span style={{color: '#3b82f6'}}>Import... ⏳</span>}
        </div>
      </div>

      <div style={{maxHeight: '400px', overflowY: 'auto'}}>
        <table className="main-table">
          <thead><tr><th>Projet</th><th>Véhicule</th><th>Tissu</th><th>Conso/Kit</th><th>Action</th></tr></thead>
          <tbody>
            {noms.map(n => (
              <tr key={n.id}><td>{n.projet.toUpperCase()}</td><td>{n.vehicule}</td><td><strong>{n.ref_tissu}</strong></td><td>{n.conso_par_kit}</td><td><button className="btn-danger btn-sm" onClick={() => deleteNom(n.id)}>Supprimer</button></td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default App;
