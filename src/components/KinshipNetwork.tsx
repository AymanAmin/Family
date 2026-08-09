import { useState } from 'react'
import LineageHierarchyView from './LineageHierarchyView'
import KinshipRelationshipNetwork from './KinshipRelationshipNetwork'

type Props = {
  personId: string
  personName: string
  onOpenPerson: (personId: string) => void
  onAddRelation?: () => void
}

type ViewMode = 'lineage' | 'network'

export default function KinshipNetwork({ personId, personName, onOpenPerson, onAddRelation }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('lineage')

  return <section className="detail-section kinship-section">
    <div className="kinship-heading">
      <div>
        <span className="eyebrow">شجرة العائلة</span>
        <h2>نسب وعلاقات {personName.split(' ')[0]}</h2>
        <p>ابدأ بهيكل النسب لرؤية الجد الأعلى والفروع والأجيال بوضوح، وانتقل إلى شبكة العلاقات عند الحاجة إلى الوالدين والإخوة والزواج والقرابات الممتدة.</p>
      </div>
      <div className="kinship-heading-actions">{onAddRelation && <button className="text-link" type="button" onClick={onAddRelation}>إضافة صلة</button>}</div>
    </div>

    <div className="kinship-view-tabs" role="tablist" aria-label="طريقة عرض الشجرة">
      <button type="button" role="tab" aria-selected={viewMode === 'lineage'} className={viewMode === 'lineage' ? 'active' : ''} onClick={() => setViewMode('lineage')}>هيكل النسب</button>
      <button type="button" role="tab" aria-selected={viewMode === 'network'} className={viewMode === 'network' ? 'active' : ''} onClick={() => setViewMode('network')}>شبكة العلاقات</button>
    </div>

    {viewMode === 'lineage' ? (
      <LineageHierarchyView personId={personId} personName={personName} onOpenPerson={onOpenPerson} onShowNetwork={() => setViewMode('network')} />
    ) : (
      <KinshipRelationshipNetwork personId={personId} personName={personName} onOpenPerson={onOpenPerson} onAddRelation={onAddRelation} />
    )}
  </section>
}
