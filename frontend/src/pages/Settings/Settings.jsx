import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { settingsService } from '../../services/adminService';
import { Tabs } from '../../components/common/Controls';
import { PageSkeleton, ErrorState } from '../../components/common/Feedback';
import { GeneralTab, SlaTab, NotifyTab, IntegrationsTab, DataTab } from './BasicTabs';
import AutomationTab from './AutomationTab';
import PeopleTab from './PeopleTab';
import TeamsTab from './TeamsTab';
import CustomersTab from './CustomersTab';
import CatalogTab from './CatalogTab';
import AuditTab from './AuditTab';

const TABS = [['general', 'General'], ['sla', 'SLA policies'], ['people', 'People'], ['teams', 'Teams'], ['customers', 'Customers'], ['automation', 'Automation'],
  ['catalog', 'Service catalog'], ['notify', 'Notifications'], ['integrations', 'Integrations'], ['audit', 'Audit log'], ['data', 'Data']];

export default function Settings() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') || 'general';
  const q = useQuery({ queryKey: ['settings'], queryFn: settingsService.get });
  if (q.isLoading) return <PageSkeleton />;
  if (q.error) return <ErrorState error={q.error} onRetry={q.refetch} />;
  const s = q.data;
  return (
    <>
      <div className="ph"><div><h1>Settings</h1><p>Configure how the desk works. Changes are saved to the database immediately.</p></div></div>
      <Tabs value={tab} onChange={(t) => setSp({ tab: t })} options={TABS} />
      {tab === 'general' ? <GeneralTab s={s} /> : null}
      {tab === 'sla' ? <SlaTab s={s} /> : null}
      {tab === 'people' ? <PeopleTab /> : null}
      {tab === 'teams' ? <TeamsTab /> : null}
      {tab === 'customers' ? <CustomersTab /> : null}
      {tab === 'automation' ? <AutomationTab s={s} /> : null}
      {tab === 'catalog' ? <CatalogTab /> : null}
      {tab === 'notify' ? <NotifyTab s={s} /> : null}
      {tab === 'integrations' ? <IntegrationsTab s={s} /> : null}
      {tab === 'audit' ? <AuditTab /> : null}
      {tab === 'data' ? <DataTab /> : null}
    </>
  );
}
