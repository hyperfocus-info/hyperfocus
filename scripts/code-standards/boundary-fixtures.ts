export function dropdownSpreadFixture(payload: string) {
  return `import { Button } from '@hyperfocus/ui'; function DropdownControl(props: Props) { return <Button {...${payload}}/>; }`;
}
