import { Search, Loader2, AlertCircle, Inbox } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DatePicker } from '@/components/ui/date-picker'
import { useHistorico } from '@/hooks/use-historico'
import { HistoricoList } from '@/components/historico/HistoricoList'

export default function Historico() {
  const {
    data,
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
  } = useHistorico()

  return (
    <div className="p-6 max-w-6xl mx-auto w-full flex flex-col h-full gap-6 animate-in fade-in zoom-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Histórico de Cotações</h1>
          <p className="text-sm text-gray-500">Visualize e gerencie suas propostas geradas.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 bg-white p-4 rounded-lg shadow-sm border items-end">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar por ID..."
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar por Agência..."
            value={searchAgencia}
            onChange={(e) => setSearchAgencia(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="w-full md:w-auto min-w-[150px]">
          <DatePicker date={dataInicio} setDate={setDataInicio} label="Data Inicial" />
        </div>
        <div className="w-full md:w-auto min-w-[150px]">
          <DatePicker date={dataFim} setDate={setDataFim} label="Data Final" />
        </div>
        <div className="w-full md:w-48">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Filtrar por Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos os Status</SelectItem>
              <SelectItem value="RASCUNHO">Rascunho</SelectItem>
              <SelectItem value="PROPOSTA_ENVIADA">Proposta Enviada</SelectItem>
              <SelectItem value="APROVADA">Aprovada</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center py-20 text-red-500 bg-white rounded-lg border border-red-100">
          <AlertCircle className="w-12 h-12 mb-4" />
          <p>Ocorreu um erro ao carregar o histórico.</p>
          <Button variant="outline" className="mt-4" onClick={fetchData}>
            Tentar novamente
          </Button>
        </div>
      ) : data.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-gray-500 bg-white rounded-lg border border-dashed">
          <Inbox className="w-16 h-16 mb-4 text-gray-300" />
          <p className="text-lg font-medium text-gray-700">Nenhuma cotação encontrada</p>
          <p className="text-sm">Você ainda não gerou nenhuma proposta com os filtros atuais.</p>
        </div>
      ) : (
        <HistoricoList
          data={data}
          onDuplicate={duplicateCotacao}
          onDelete={deleteCotacao}
          onDownload={downloadPDF}
          onUpdate={fetchData}
          onUpdateAgencia={updateAgencia}
        />
      )}
    </div>
  )
}
