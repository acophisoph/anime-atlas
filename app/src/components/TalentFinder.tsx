import { intersectSorted } from '../lib/setOps';

export function TalentFinder({ roleToPeople, tagRoleToPeople, peopleById, onOpenPerson }: any) {
  const roles = Object.keys(roleToPeople);
  return (
    <div>
      <h3>Talent Finder</h3>
      {roles.slice(0, 8).map((role) => {
        const tags = Object.keys(tagRoleToPeople).filter((k) => k.startsWith(role + '|')).slice(0, 4);
        const people = intersectSorted([roleToPeople[role] ?? [], ...(tags.map((t) => tagRoleToPeople[t]))]);
        return <div key={role}><strong>{role}</strong><ul>{people.slice(0, 6).map((id) => <li key={id}><button onClick={() => onOpenPerson(id)}>{peopleById[id]?.name?.full || id}</button></li>)}</ul></div>;
      })}
    </div>
  );
}
