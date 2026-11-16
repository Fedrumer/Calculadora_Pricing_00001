-- Catálogo versão 1: venda de produtos com preço de lista e desconto (indústria, distribuição, varejo B2B).
-- Métricas, limiares, regras, alavancas e pesos são dados: adaptar a outro setor é configuração.

insert into public.catalogo_versoes (versao, descricao, vigente) values (1, 'MVP: realização de preço, margem e dispersão', true);

insert into public.metricas_catalogo (versao, codigo, dimensao, nome, unidade, limiar_bom, limiar_ruim, peso, ordem, descricao) values
  (1, 'vazamento_pct',               'realizacao', 'Vazamento de preço',                    '%',  15,  40, 2, 1, 'Parcela do preço de lista que não chega ao pocket price'),
  (1, 'desconto_fatura_pct',         'realizacao', 'Desconto em fatura',                    '%',   8,  30, 1, 2, 'Descontos concedidos na nota, em % da receita de lista'),
  (1, 'fora_fatura_pct',             'realizacao', 'Descontos fora da fatura',              '%', null, null, 0, 3, 'Rebates, bonificações e verbas, em % da receita de lista'),
  (1, 'custo_servir_pct',            'realizacao', 'Custo de servir',                       '%', null, null, 0, 4, 'Frete, comissão, prazo e outros, em % da receita de lista'),
  (1, 'margem_contribuicao_pct',     'margem',     'Margem de contribuição',                '%',  35,  10, 1, 1, 'Receita faturada menos custo do produto, em % da receita faturada'),
  (1, 'margem_pocket_pct',           'margem',     'Pocket margin',                         '%',  25,   5, 2, 2, 'Receita pocket menos custo do produto, em % da receita pocket'),
  (1, 'receita_margem_negativa_pct', 'margem',     'Receita com margem negativa',           '%',   2,  15, 1, 3, 'Parcela da receita faturada em pares conta e produto com pocket margin negativa'),
  (1, 'dispersao_banda_pct',         'dispersao',  'Amplitude da banda de preço',           '%',  10,  40, 2, 1, 'Distância entre os percentis 90 e 10 do preço por conta, em % da mediana, ponderada pela receita'),
  (1, 'cv_preco_pct',                'dispersao',  'Coeficiente de variação do preço',      '%', null, null, 0, 2, 'Desvio padrão do preço por conta sobre a média, ponderado pela receita'),
  (1, 'correlacao_desconto_volume',  'dispersao',  'Correlação entre desconto e volume',    'índice', 0.6, 0, 1, 3, 'Correlação entre o desconto em fatura da conta e o logaritmo do volume dela');

-- As sete dimensões do diagnóstico completo. O MVP calcula as três primeiras;
-- a nota geral redistribui os pesos entre as dimensões calculadas e é marcada como parcial.
insert into public.pesos_setor (versao, setor, dimensao, peso) values
  (1, 'distribuicao', 'realizacao', 25), (1, 'distribuicao', 'margem', 25), (1, 'distribuicao', 'dispersao', 15),
  (1, 'distribuicao', 'mix', 10), (1, 'distribuicao', 'elasticidade', 5), (1, 'distribuicao', 'competitividade', 10), (1, 'distribuicao', 'governanca', 10),
  (1, 'industria', 'realizacao', 20), (1, 'industria', 'margem', 30), (1, 'industria', 'dispersao', 15),
  (1, 'industria', 'mix', 10), (1, 'industria', 'elasticidade', 5), (1, 'industria', 'competitividade', 10), (1, 'industria', 'governanca', 10),
  (1, 'varejo_b2b', 'realizacao', 25), (1, 'varejo_b2b', 'margem', 20), (1, 'varejo_b2b', 'dispersao', 15),
  (1, 'varejo_b2b', 'mix', 15), (1, 'varejo_b2b', 'elasticidade', 5), (1, 'varejo_b2b', 'competitividade', 10), (1, 'varejo_b2b', 'governanca', 10);

insert into public.alavancas_catalogo (versao, codigo, nome, ordem, descricao) values
  (1, 'contencao_descontos', 'Contenção de descontos', 1, 'Levar ao piso da banda os preços de contas cujo volume não justifica o desconto'),
  (1, 'reajuste_seletivo',   'Reajuste seletivo',      2, 'Aumentar o preço de produtos com margem baixa ou negativa, líquido da perda de volume');

insert into public.regras_achado (versao, codigo, dimensao, titulo, descricao, alavanca, parametros) values
  (1, 'vazamento_alto', 'realizacao', 'Vazamento de preço acima do limite',
   'O preço de lista perde mais do que o limite até chegar ao caixa.', 'contencao_descontos', '{"limite_pct": 25}'),
  (1, 'contas_pequenas_desconto_alto', 'dispersao', 'Contas pequenas com desconto de conta grande',
   'Contas no quartil inferior de volume recebem desconto acima da mediana do quartil superior.', 'contencao_descontos', '{"min_transacoes": 5}'),
  (1, 'preco_abaixo_do_piso', 'dispersao', 'Preços abaixo do piso da banda',
   'Contas fora do quartil superior de volume compram abaixo do piso da banda de preço do produto.', 'contencao_descontos', '{"percentil_piso": 25, "min_contas": 5}'),
  (1, 'margem_negativa', 'margem', 'Produtos vendidos com margem negativa',
   'O pocket price não cobre o custo do produto.', 'reajuste_seletivo', '{"min_transacoes": 5}'),
  (1, 'margem_baixa', 'margem', 'Produtos com margem abaixo do alvo',
   'A pocket margin é positiva, mas fica abaixo do alvo.', 'reajuste_seletivo', '{"alvo_pct": 10, "min_transacoes": 5}'),
  (1, 'desconto_sem_relacao_com_volume', 'dispersao', 'Desconto não acompanha o volume',
   'A correlação entre desconto e volume é fraca: o desconto é explicado pela negociação, não pelo tamanho da conta.', null, '{"limite": 0.3}');

-- Premissas por cenário. percentil_piso: piso da banda; fechamento: parcela da distância até o piso
-- que o ajuste fecha; elasticidade: negativa; captura: parcela que a equipe comercial implementa.
insert into public.premissas_padrao (versao, cenario, alavanca, chave, valor) values
  (1, 'conservador', 'contencao_descontos', 'percentil_piso', 25), (1, 'conservador', 'contencao_descontos', 'fechamento', 0.3),
  (1, 'conservador', 'contencao_descontos', 'elasticidade', -1.0), (1, 'conservador', 'contencao_descontos', 'captura', 0.4),
  (1, 'base',        'contencao_descontos', 'percentil_piso', 25), (1, 'base',        'contencao_descontos', 'fechamento', 0.5),
  (1, 'base',        'contencao_descontos', 'elasticidade', -0.7), (1, 'base',        'contencao_descontos', 'captura', 0.6),
  (1, 'agressivo',   'contencao_descontos', 'percentil_piso', 35), (1, 'agressivo',   'contencao_descontos', 'fechamento', 0.7),
  (1, 'agressivo',   'contencao_descontos', 'elasticidade', -0.4), (1, 'agressivo',   'contencao_descontos', 'captura', 0.8),
  (1, 'conservador', 'reajuste_seletivo', 'margem_alvo_pct', 10), (1, 'conservador', 'reajuste_seletivo', 'aumento_pct', 2),
  (1, 'conservador', 'reajuste_seletivo', 'elasticidade', -1.5),  (1, 'conservador', 'reajuste_seletivo', 'captura', 0.4),
  (1, 'base',        'reajuste_seletivo', 'margem_alvo_pct', 10), (1, 'base',        'reajuste_seletivo', 'aumento_pct', 4),
  (1, 'base',        'reajuste_seletivo', 'elasticidade', -1.0),  (1, 'base',        'reajuste_seletivo', 'captura', 0.6),
  (1, 'agressivo',   'reajuste_seletivo', 'margem_alvo_pct', 10), (1, 'agressivo',   'reajuste_seletivo', 'aumento_pct', 6),
  (1, 'agressivo',   'reajuste_seletivo', 'elasticidade', -0.6),  (1, 'agressivo',   'reajuste_seletivo', 'captura', 0.8);
