-- Dati demo per lo sviluppo: un ristorante con un widget chat autorizzato su localhost.
-- Idempotente: si puo' rieseguire senza errori.

INSERT OR IGNORE INTO organizations (id, name, slug)
VALUES ('org_dev', 'Snippo Demo', 'snippo-demo');

INSERT OR IGNORE INTO projects (id, organization_id, name, industry)
VALUES ('prj_dev', 'org_dev', 'Trattoria Demo', 'restaurant');

INSERT OR IGNORE INTO project_domains (id, project_id, domain) VALUES
  ('dom_dev_localhost', 'prj_dev', 'localhost'),
  ('dom_dev_loopback', 'prj_dev', '127.0.0.1');

INSERT OR IGNORE INTO widgets (id, project_id, type, name, public_key, theme)
VALUES ('wgt_dev', 'prj_dev', 'chat', 'Prenotazioni', 'pk_dev_snippo',
  '{"primaryColor":"#c2410c","position":"right","title":"Trattoria Demo"}');

INSERT OR IGNORE INTO flow_versions (id, widget_id, version, template, definition, published_at)
VALUES ('fv_dev_1', 'wgt_dev', 1, 'restaurant', '{
  "steps": [
    {"key":"welcome","type":"message","prompt":"Ciao! Vuoi prenotare un tavolo?"},
    {"key":"date","type":"date","prompt":"Per che giorno?"},
    {"key":"time","type":"time","prompt":"A che ora?","options":["12:30","13:30","19:30","20:30","21:30"]},
    {"key":"party_size","type":"number","prompt":"Quante persone?","min":1,"max":12},
    {"key":"name","type":"text","prompt":"Come ti chiami?","maxLength":80},
    {"key":"phone","type":"phone","prompt":"Un numero di telefono per confermarti?"},
    {"key":"notes","type":"text","prompt":"Allergie o richieste particolari?","required":false,"maxLength":500}
  ],
  "successMessage":"Richiesta inviata! Ti confermeremo la prenotazione al piu'' presto."
}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

UPDATE widgets SET active_flow_version_id = 'fv_dev_1' WHERE id = 'wgt_dev';
