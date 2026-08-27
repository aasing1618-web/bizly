-- ===========================================================================
-- Bizly — 0002_referentiels
-- Données de référence : devises, secteurs d'activité, modèles de catégories
-- de dépense.
--
-- Idempotent (ON CONFLICT DO NOTHING) : rejouer cette migration ne casse rien
-- et n'écrase pas un libellé modifié à la main.
--
-- `[À VALIDER]` La liste des secteurs conditionne les règles du moteur de
-- questions intelligentes (CLAUDE.md §6). Neuf secteurs proposés ici : à
-- compléter ou réduire selon la cible commerciale réelle.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Devises
--
-- `decimales` est la donnée critique : XOF/XAF n'ont AUCUNE subdivision,
-- le dinar tunisien en a TROIS. Un moteur qui suppose 2 se trompe d'un
-- facteur 100 ou 10 selon la devise.
-- ---------------------------------------------------------------------------
INSERT INTO devises (code, libelle, symbole, decimales) VALUES
  ('EUR', 'Euro',                     '€',    2),
  ('XOF', 'Franc CFA (BCEAO)',        'FCFA', 0),
  ('XAF', 'Franc CFA (BEAC)',         'FCFA', 0),
  ('MAD', 'Dirham marocain',          'DH',   2),
  ('DZD', 'Dinar algérien',           'DA',   2),
  ('TND', 'Dinar tunisien',           'DT',   3),
  ('USD', 'Dollar américain',         '$',    2),
  ('CAD', 'Dollar canadien',          '$',    2),
  ('CHF', 'Franc suisse',             'CHF',  2),
  ('GBP', 'Livre sterling',           '£',    2)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Secteurs d'activité
-- ---------------------------------------------------------------------------
INSERT INTO secteurs (code, libelle, ordre) VALUES
  ('commerce_detail',      'Commerce de détail',                   10),
  ('restauration',         'Restauration, café, bar',              20),
  ('services_pro',         'Services professionnels et conseil',   30),
  ('artisanat_btp',        'Artisanat et BTP',                     40),
  ('beaute_bienetre',      'Beauté et bien-être',                  50),
  ('sante',                'Santé et paramédical',                 60),
  ('transport_logistique', 'Transport et logistique',              70),
  ('education_formation',  'Éducation et formation',               80),
  ('autre',                'Autre activité',                      999)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Modèles de catégories de dépense
--
-- Copiés dans `categories_depense` à la création d'une entreprise, filtrés sur
-- son secteur : `secteurs = '{}'` signifie « proposé à tout le monde ».
-- ---------------------------------------------------------------------------
INSERT INTO modeles_categorie_depense (code, libelle, secteurs, ordre) VALUES
  ('achats_marchandises',  'Achats de marchandises',
     '{commerce_detail,restauration}',                    10),
  ('matieres_premieres',   'Matières premières',
     '{restauration,artisanat_btp}',                      20),
  ('sous_traitance',       'Sous-traitance',
     '{artisanat_btp,services_pro,transport_logistique}', 30),
  ('loyer',                'Loyer et charges locatives',  '{}',  40),
  ('energie',              'Énergie (électricité, eau, gaz)', '{}', 50),
  ('salaires',             'Salaires',                    '{}',  60),
  ('charges_sociales',     'Charges sociales',            '{}',  70),
  ('carburant',            'Carburant',                   '{}',  80),
  ('transport',            'Transport et déplacements',   '{}',  90),
  ('telephone_internet',   'Téléphone et internet',       '{}', 100),
  ('fournitures',          'Fournitures et petit équipement', '{}', 110),
  ('materiel',             'Matériel et outillage',       '{}', 120),
  ('entretien_reparation', 'Entretien et réparations',    '{}', 130),
  ('marketing',            'Publicité et marketing',      '{}', 140),
  ('assurance',            'Assurances',                  '{}', 150),
  ('honoraires',           'Honoraires (comptable, avocat…)', '{}', 160),
  ('frais_bancaires',      'Frais bancaires',             '{}', 170),
  ('impots_taxes',         'Impôts et taxes',             '{}', 180),
  ('formation',            'Formation',                   '{}', 190),
  ('autre',                'Autre dépense',               '{}', 999)
ON CONFLICT (code) DO NOTHING;
