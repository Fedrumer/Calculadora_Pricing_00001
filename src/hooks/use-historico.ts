import { useState, useEffect } from 'react'
import pb from '@/lib/pocketbase/client'
import { useToast } from '@/hooks/use-toast'
import { gerarPDFProposta } from '@/lib/pdf'

export function useHistorico() {
  const { toast } = useToast()
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [searchId, setSearchId] = useState('')
  const [searchAgencia, setSearchAgencia] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [dataInicio, setDataInicio] = useState<Date | undefined>(undefined)
  const [dataFim, setDataFim] = useState<Date | undefined>(undefined)

  const fetchData = async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await pb.collection('cotacoes').getList(1, 100, {
        expand:
          'forma_pagamento_id,cotacao_produtos_via_cotacao_id.produto_id,cotacao_produtos_via_cotacao_id.cotacao_produto_detalhes_via_cotacao_produto_id',
        sort: '-created',
      })
      setData(res.items)
    } catch (err) {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const filteredData = data.filter((item) => {
    const matchId = searchId ? item.id.toLowerCase().includes(searchId.toLowerCase()) : true
    const matchStatus = statusFilter !== 'ALL' ? item.status === statusFilter : true
    const matchAgencia = searchAgencia
      ? (item.nome_agencia || '').toLowerCase().includes(searchAgencia.toLowerCase())
      : true

    let matchDate = true
    if (dataInicio || dataFim) {
      const itemDate = new Date(item.created)
      itemDate.setHours(0, 0, 0, 0)
      if (dataInicio) {
        const start = new Date(dataInicio)
        start.setHours(0, 0, 0, 0)
        if (itemDate < start) matchDate = false
      }
      if (dataFim) {
        const end = new Date(dataFim)
        end.setHours(23, 59, 59, 999)
        if (itemDate > end) matchDate = false
      }
    }

    return matchId && matchStatus && matchAgencia && matchDate
  })

  const duplicateCotacao = async (cotacao: any) => {
    try {
      const payload = {
        usuario_id: cotacao.usuario_id,
        status: 'RASCUNHO',
        forma_pagamento_id: cotacao.forma_pagamento_id,
        comissao: cotacao.comissao,
        data_inicio: cotacao.data_inicio,
        data_fim: cotacao.data_fim,
        qtd_dias: cotacao.qtd_dias,
        fatura_total: cotacao.fatura_total,
        preco_unitario_total: cotacao.preco_unitario_total,
        tipo_preco: cotacao.tipo_preco,
        moeda: cotacao.moeda,
        nome_agencia: cotacao.nome_agencia,
        produtos:
          cotacao.expand?.cotacao_produtos_via_cotacao_id?.map((cp: any) => {
            const pid = cp.produto_id || cp.expand?.produto_id?.id
            if (!pid) {
              throw new Error('Produto ID ausente ou inválido em um dos itens da cotação.')
            }
            return {
              produto_id: pid,
              qtd_ate_75: cp.qtd_ate_75,
              qtd_76_a_85: cp.qtd_76_a_85,
              preco_total_produto: cp.preco_total_produto,
              detalhes:
                cp.expand?.cotacao_produto_detalhes_via_cotacao_produto_id?.map((det: any) => ({
                  destino_codigo: det.destino_codigo,
                  faixa_etaria: det.faixa_etaria,
                  preco_unitario_dia: det.preco_unitario_dia,
                  preco_total_faixa: det.preco_total_faixa,
                })) || [],
            }
          }) || [],
      }

      await pb.send('/backend/v1/cotacoes', {
        method: 'POST',
        body: payload,
      })
      toast({ title: 'Sucesso', description: 'Cotação duplicada com sucesso.' })
      fetchData()
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description:
          err?.response?.message || err?.message || 'Não foi possível duplicar a cotação.',
      })
    }
  }

  const deleteCotacao = async (id: string) => {
    try {
      await pb.collection('cotacoes').delete(id)
      toast({ title: 'Sucesso', description: 'Cotação excluída.' })
      fetchData()
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Erro ao excluir cotação.' })
    }
  }

  const updateAgencia = async (id: string, nomeAgencia: string) => {
    try {
      await pb.collection('cotacoes').update(id, { nome_agencia: nomeAgencia })
      toast({ title: 'Sucesso', description: 'Agência atualizada com sucesso.' })
      fetchData()
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Erro ao atualizar agência.' })
      throw err
    }
  }

  const downloadPDF = (cotacao: any) => {
    const produtos_detalhes =
      cotacao.expand?.cotacao_produtos_via_cotacao_id?.map((cp: any) => ({
        produto_nome: cp.expand?.produto_id?.nome || 'Produto',
        qtd_ate_75: cp.qtd_ate_75,
        qtd_76_a_85: cp.qtd_76_a_85,
        preco_total_produto: cp.preco_total_produto,
        detalhes:
          cp.expand?.cotacao_produto_detalhes_via_cotacao_produto_id?.map((det: any) => ({
            destino_nome: det.destino_codigo,
            faixa_etaria: det.faixa_etaria,
            preco_unitario_dia: det.preco_unitario_dia,
            preco_total_faixa: det.preco_total_faixa,
          })) || [],
      })) || []

    const blob = gerarPDFProposta(
      {
        ...cotacao,
        fatura_total: cotacao.fatura_total || 0,
        moeda: cotacao.moeda || 'USD',
        forma_pagamento: cotacao.expand?.forma_pagamento_id?.nome,
      },
      produtos_detalhes,
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `proposta_${cotacao.id}_${new Date().toISOString().split('T')[0]}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  }

  return {
    data: filteredData,
    loading,
    error,
    fetchData,
    searchId,
    setSearchId,
    searchAgencia,
    setSearchAgencia,
    statusFilter,
    setStatusFilter,
    dataInicio,
    setDataInicio,
    dataFim,
    setDataFim,
    duplicateCotacao,
    deleteCotacao,
    updateAgencia,
    downloadPDF,
  }
}
