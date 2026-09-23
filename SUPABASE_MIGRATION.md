# Migração Firebase para Supabase

## Preparação

1. Crie um projeto no Supabase.
2. Em **SQL Editor**, execute [`supabase/schema.sql`](./supabase/schema.sql).
3. No Firebase Console, gere uma chave privada em **Project settings > Service accounts** e salve-a em `secrets/firebase-service-account.json`.
4. Copie [`.env.example`](./.env.example) para `.env.local` e preencha a URL e a `service_role` do Supabase. O script carrega `.env.local` automaticamente.

Nunca publique `.env.local`, a chave `service_role` ou o JSON do Firebase.

## Simulação

Com `MIGRATION_DRY_RUN=true`, a ferramenta apenas lê e contabiliza os dados:

```powershell
npm run migrate:firebase
```

O relatório será salvo em `migration-report-<timestamp>.json`.

## Migração

Depois de conferir a simulação, altere `MIGRATION_DRY_RUN=false` e execute novamente. A ferramenta migra:

- membros;
- eventos;
- contatos, batismos, voluntários, pedidos de oração e interesse em grupos;
- usuários administrativos por convite de e-mail;
- permissões administrativas por e-mail;
- arquivos do Firebase Storage para o bucket privado `church-files`.

Se uma conta do Firebase tiver um endereço rejeitado pelo Supabase, ela será registrada em `users.invalid` no relatório e as demais contas continuarão sendo processadas. Corrija o endereço no Firebase e execute a migração novamente; as operações são feitas com `upsert` e convites já existentes não são duplicados.

## Gestão integrada: operação da igreja

O mesmo schema já inclui a base dos novos módulos:

- `ministries` e `ministry_members`: ministérios, líderes e participantes;
- `cells` e `cell_members`: células, reuniões e participantes;
- `schedules` e `schedule_assignments`: escalas, funções e aceite ou recusa;
- `attendance_sessions` e `attendance_records`: presença manual ou por QR Code;
- `pastoral_followups`: acompanhamento pastoral com prioridade, responsável e próximo contato.

O acesso dessas tabelas exige a permissão `fase2` ou `ministerios`. Essa proteção é aplicada no banco, além da futura ocultação dos menus no painel. Para dados pastorais, mantenha a permissão restrita a pastores e responsáveis autorizados.

## Fase 3: gestão avançada

O schema também prepara:

- `finance_categories` e `finance_transactions`: entradas, despesas, categorias e fechamento mensal;
- `assets` e `maintenance_requests`: patrimônio, localização, estado e manutenção;
- `notifications`: avisos internos por administrador;
- `integration_connections`: configuração controlada para WhatsApp, e-mail e calendários;
- `admin_overview_report`: visão consolidada de membros, eventos, acompanhamento, presença e financeiro.

As permissões de gestão são específicas: `ministerios`, `celulas`, `escalas`, `presenca`, `pastoral`, `financeiro`, `patrimonio`, `manutencao`, `notificacoes` e `integracoes`. A área pastoral deve ser atribuída somente a pastores. Líderes com `ministerios` gerenciam apenas ministérios cujo `leader_user_id` corresponde ao próprio usuário; `ministerios_coordenacao` permite coordenação geral. Segredos de provedores nunca devem ser salvos no navegador; as integrações devem ser executadas por funções server-side.

O painel também possui um `manifest.webmanifest` e um service worker para instalação como aplicativo (PWA). O cache contém apenas o shell visual; os dados continuam protegidos e devem ser carregados pela API autenticada.

## Painel administrativo unificado

`login/admin-dashboard.html` é a página principal única do painel. Membresia e Eventos são carregados dentro dela com os módulos completos, preservando os fluxos legados de foto, carteirinha, impressão, filtros, capas e limpeza de eventos. Os endereços antigos continuam disponíveis para compatibilidade.

As contas do Firebase não podem ter suas senhas lidas por uma aplicação. Por isso, os usuários são convidados no Supabase e precisam definir uma nova senha pelo link recebido.

## Segurança

As tabelas usam Row Level Security. A interface pode ocultar menus, mas a proteção real fica nas policies do Supabase. O usuário administrativo precisa ter um registro em `admin_profiles`; `superadmin` recebe acesso total conforme a função `has_permission`.
