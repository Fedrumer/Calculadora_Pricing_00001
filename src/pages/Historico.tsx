import { Search, Loader2, AlertCircle, Inbox } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/hooks/use-translation'
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
  const { t } = useTranslation()

  return (
    <div className="p-6 max-w-6xl mx-auto w-full flex flex-col h-full gap-6 animate-in fade-in zoom-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('history.title')}</h1>
          <p className="text-sm text-gray-500">{t('history.subtitle')}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 bg-white p-4 rounded-lg shadow-sm border items-end">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <Input
            placeholder={t('history.search_id')}
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <Input
            placeholder={t('history.search_agency')}
            value={searchAgencia}
            onChange={(e) => setSearchAgencia(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="w-full md:w-auto min-w-[150px]">
          <DatePicker date={dataInicio} setDate={setDataInicio} label={t('history.start_date')} />
        </div>
        <div className="w-full md:w-auto min-w-[150px]">
          <DatePicker date={dataFim} setDate={setDataFim} label={t('history.end_date')} />
        </div>
        <div className="w-full md:w-48">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder={t('history.filter_status')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t('history.all_status')}</SelectItem>
              <SelectItem value="RASCUNHO">{t('history.status_draft')}</SelectItem>
              <SelectItem value="PROPOSTA_ENVIADA">{t('history.status_sent')}</SelectItem>
              <SelectItem value="APROVADA">{t('history.status_approved')}</SelectItem>
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
          <p>{t('history.loading_error')}</p>
          <Button variant="outline" className="mt-4" onClick={fetchData}>
            {t('history.try_again')}
          </Button>
        </div>
      ) : data.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-gray-500 bg-white rounded-lg border border-dashed">
          <Inbox className="w-16 h-16 mb-4 text-gray-300" />
          <p className="text-lg font-medium text-gray-700">{t('history.empty_title')}</p>
          <p className="text-sm">{t('history.empty_subtitle')}</p>
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
