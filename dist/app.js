const views = {
  today: "Aujourd'hui",
  patients: "Clients du centre",
  practitioners: "Praticiens",
  agenda: "Agenda",
  requests: "Demandes",
  billing: "Facturation",
  documents: "Documents",
  statistics: "Statistiques",
  portal: "Aperçu portail client",
  access: "Accès & confidentialité"
};

const content = document.getElementById('content');
const breadcrumb = document.getElementById('breadcrumbTitle');
const sidebar = document.getElementById('sidebar');
const toast = document.getElementById('toast');

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2800);
}

function render(view, push = true) {
  if (!views[view]) view = 'today';
  const template = document.getElementById(`${view}-view`);
  content.replaceChildren(template.content.cloneNode(true));
  breadcrumb.textContent = views[view];
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  sidebar.classList.remove('open');
  if (push) history.pushState({ view }, '', `#${view}`);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.addEventListener('click', event => {
  const nav = event.target.closest('[data-view]');
  if (nav) return render(nav.dataset.view);

  const link = event.target.closest('[data-view-link]');
  if (link) return render(link.dataset.viewLink);

  const action = event.target.closest('[data-action]');
  if (!action) return;
  const messages = {
    'new-appointment': 'Formulaire de rendez-vous prêt pour la prochaine couche.',
    'new-patient': 'Ajout d’un client : seules les données administratives seront demandées.',
    'new-message': 'Le message sera identifié « Centre Horizon » dans le portail.',
    'new-invoice': 'Création de facture simulée — aucune donnée réelle.',
    'new-practitioner': 'Invitation praticien simulée. Le lien Yulyf restera contrôlé.',
    'open-practitioner': 'Fiche des accès du praticien ouverte en démonstration.',
    'open-patient': 'Fiche administrative uniquement — aucun dossier sensible.',
    'new-request': 'Nouvelle demande administrative simulée.',
    'accept-request': 'Demande acceptée dans la démonstration.',
    'refuse-request': 'Demande refusée dans la démonstration.',
    'reply-request': 'Réponse du centre simulée.',
    'new-document': 'Dépôt réservé aux documents administratifs du centre.',
    'switch-patient': 'Le changement de client sera actif avec la base de démonstration.',
    'request-change': 'Demande de modification envoyée au centre (simulation).',
    'download-demo': 'Téléchargement de démonstration — aucun fichier réel.'
  };
  showToast(messages[action.dataset.action] || 'Action de démonstration.');
});

document.addEventListener('input', event => {
  const id = event.target.dataset.tableSearch;
  if (!id) return;
  const query = event.target.value.toLowerCase().trim();
  document.querySelectorAll(`#${id} tbody tr`).forEach(row => {
    row.hidden = !row.textContent.toLowerCase().includes(query);
  });
});

document.getElementById('menuToggle').addEventListener('click', () => sidebar.classList.toggle('open'));
window.addEventListener('popstate', () => render(location.hash.slice(1) || 'today', false));

render(location.hash.slice(1) || 'today', false);
