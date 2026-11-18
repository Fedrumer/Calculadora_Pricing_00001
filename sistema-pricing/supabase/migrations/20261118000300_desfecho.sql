-- A3: motivo de perda em lista configurável (organizacao.config.motivosPerda).
-- O texto livre passa a ser opcional (obrigatório só na categoria "outro") e a
-- categoria passa a ser obrigatória. Perdas já gravadas recebem "outro", com o
-- texto preservado em desfecho_motivo.

alter table public.cotacoes
  add column desfecho_categoria text check (desfecho_categoria is null or desfecho_categoria ~ '^[a-z0-9_]{1,40}$'),
  add column concorrente_nome text check (concorrente_nome is null or length(concorrente_nome) <= 120),
  add column concorrente_preco numeric(16, 2) check (concorrente_preco is null or concorrente_preco >= 0);

-- Gatilho substituído, não editado: mesma máquina de estados, com a regra da perda nova.
create or replace function app.transicao_cotacao() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_ok boolean;
begin
  if new.org_id <> old.org_id or new.numero <> old.numero then
    raise exception 'Organização e número da cotação não mudam.' using errcode = 'P0001';
  end if;
  if new.status = old.status then
    if old.status in ('aceita', 'perdida', 'cancelada') and new.anonimizada_em is not distinct from old.anonimizada_em
       and (to_jsonb(new) - 'atualizado_em') is distinct from (to_jsonb(old) - 'atualizado_em') then
      raise exception 'Cotação % está encerrada (%).', old.numero, old.status using errcode = 'P0001';
    end if;
    return new;
  end if;
  v_ok := case old.status
    when 'rascunho' then new.status in ('emitida', 'em_aprovacao', 'cancelada')
    when 'em_aprovacao' then new.status in ('aprovada', 'recusada', 'cancelada')
    when 'recusada' then new.status in ('rascunho', 'cancelada')
    when 'aprovada' then new.status in ('emitida', 'rascunho', 'cancelada')
    when 'emitida' then new.status in ('aceita', 'perdida', 'expirada', 'rascunho')
    when 'expirada' then new.status in ('rascunho')
    else false
  end;
  if not v_ok then
    raise exception 'Transição de status inválida: % para %.', old.status, new.status using errcode = 'P0001';
  end if;
  -- A3: o motivo da perda continua obrigatório, agora como categoria; "outro" exige o texto.
  if new.status = 'perdida' and coalesce(btrim(new.desfecho_categoria), '') = '' then
    raise exception 'A categoria do motivo da perda é obrigatória.' using errcode = 'P0001';
  end if;
  if new.status = 'perdida' and new.desfecho_categoria = 'outro' and coalesce(btrim(new.desfecho_motivo), '') = '' then
    raise exception 'Perda na categoria "outro" exige o texto do motivo.' using errcode = 'P0001';
  end if;
  if new.status = 'emitida' then
    -- só chega ao cliente final dentro da política ou com exceção aprovada para esta versão
    if not exists (
      select 1 from public.cotacao_versoes v
      where v.id = new.versao_atual_id and v.cotacao_id = new.id
        and (v.veredito = 'dentro'
             or (v.veredito = 'exige_aprovacao' and exists (
                   select 1 from public.aprovacoes a where a.versao_id = v.id and a.status = 'aprovada')))
    ) then
      raise exception 'A versão atual não está dentro da política nem tem exceção aprovada.' using errcode = 'P0001';
    end if;
    if new.validade is null then
      raise exception 'Cotação emitida precisa de data de validade.' using errcode = 'P0001';
    end if;
  end if;
  if new.status in ('aceita', 'perdida', 'expirada', 'cancelada') then
    new.encerrada_em := coalesce(new.encerrada_em, now());
  end if;
  return new;
end $$;

-- Preenchimento das perdas antigas. A cotação encerrada não aceita alteração, então o
-- gatilho de transição fica desligado só durante este comando (a auditoria registra a mudança).
alter table public.cotacoes disable trigger cotacoes_transicao;
update public.cotacoes set desfecho_categoria = 'outro'
 where status = 'perdida' and desfecho_categoria is null;
alter table public.cotacoes enable trigger cotacoes_transicao;

create index cotacoes_desfecho_categoria on public.cotacoes (org_id, desfecho_categoria) where status = 'perdida';
