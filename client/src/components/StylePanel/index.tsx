import { Panel } from '../Panel';
import { Tabs } from '../Tabs';
import { BadgesTab } from './BadgesTab';
import { ColorsTab } from './ColorsTab';
import { TypographyTab } from './TypographyTab';

export function StylePanel() {
  return (
    <Panel title="Style">
      <Tabs
        tabs={[
          { id: 'typography', label: 'Typography', content: <TypographyTab /> },
          { id: 'colors', label: 'Colors', content: <ColorsTab /> },
          { id: 'badges', label: 'Badges', content: <BadgesTab /> },
        ]}
      />
    </Panel>
  );
}
