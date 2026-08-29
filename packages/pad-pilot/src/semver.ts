type ParsedIdentifier = {
  numeric: boolean;
  value: number | string;
};

type ParsedSemVer = {
  core: [number, number, number];
  prerelease: ParsedIdentifier[];
};

const semverPattern =
  /^\s*v?(?<major>0|[1-9]\d*)(?:\.(?<minor>0|[1-9]\d*))?(?:\.(?<patch>0|[1-9]\d*))?(?:-(?<prerelease>[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?\s*$/;

function parseIdentifier(value: string) {
  if (/^\d+$/.test(value) && !/^(0|[1-9]\d*)$/.test(value)) {
    return null;
  }
  if (/^(0|[1-9]\d*)$/.test(value)) {
    const numericValue = Number(value);
    if (!Number.isSafeInteger(numericValue)) {
      return null;
    }
    const parsed: ParsedIdentifier = {
      numeric: true,
      value: numericValue,
    };
    return parsed;
  }

  const parsed: ParsedIdentifier = {
    numeric: false,
    value,
  };
  return parsed;
}

export function parseSemVer(value: string) {
  if (value.length > 256) {
    return null;
  }
  const match = semverPattern.exec(value);
  if (!match?.groups) {
    return null;
  }

  const core = [
    Number(match.groups.major),
    Number(match.groups.minor ?? "0"),
    Number(match.groups.patch ?? "0"),
  ] as const;
  if (!core.every(Number.isSafeInteger)) {
    return null;
  }

  const prerelease: ParsedIdentifier[] = [];
  for (const identifier of (match.groups.prerelease ?? "").split(".").filter(Boolean)) {
    const parsed = parseIdentifier(identifier);
    if (!parsed) {
      return null;
    }
    prerelease.push(parsed);
  }

  const parsed: ParsedSemVer = { core: [core[0], core[1], core[2]], prerelease };
  return parsed;
}

function compareIdentifiers(left: ParsedIdentifier, right: ParsedIdentifier) {
  if (left.numeric && right.numeric) {
    return left.value === right.value ? 0 : Number(left.value) > Number(right.value) ? 1 : -1;
  }
  if (left.numeric) {
    return -1;
  }
  if (right.numeric) {
    return 1;
  }
  const leftValue = String(left.value);
  const rightValue = String(right.value);
  return leftValue === rightValue ? 0 : leftValue > rightValue ? 1 : -1;
}

export function compareSemVer(left: string, right: string) {
  const parsedLeft = parseSemVer(left);
  const parsedRight = parseSemVer(right);

  if (!parsedLeft || !parsedRight) {
    const normalizedLeft = left.toLowerCase();
    const normalizedRight = right.toLowerCase();
    return normalizedLeft === normalizedRight ? 0 : normalizedLeft > normalizedRight ? 1 : -1;
  }

  for (let index = 0; index < parsedLeft.core.length; index += 1) {
    if (parsedLeft.core[index] === parsedRight.core[index]) {
      continue;
    }
    return parsedLeft.core[index] > parsedRight.core[index] ? 1 : -1;
  }

  if (parsedLeft.prerelease.length === 0 && parsedRight.prerelease.length === 0) {
    return 0;
  }
  if (parsedLeft.prerelease.length === 0) {
    return 1;
  }
  if (parsedRight.prerelease.length === 0) {
    return -1;
  }

  const maxLength = Math.max(parsedLeft.prerelease.length, parsedRight.prerelease.length);
  for (let index = 0; index < maxLength; index += 1) {
    const leftIdentifier = parsedLeft.prerelease[index];
    const rightIdentifier = parsedRight.prerelease[index];
    if (!leftIdentifier) {
      return -1;
    }
    if (!rightIdentifier) {
      return 1;
    }
    const compared = compareIdentifiers(leftIdentifier, rightIdentifier);
    if (compared !== 0) {
      return compared;
    }
  }

  return 0;
}

export function isSemVerInRange(
  version: string,
  input: {
    max: string | null | undefined;
    min: string | null | undefined;
  },
) {
  if (!parseSemVer(version) || (input.min && !parseSemVer(input.min)) || (input.max && !parseSemVer(input.max))) {
    return false;
  }
  if (input.min && compareSemVer(version, input.min) < 0) {
    return false;
  }
  if (input.max && compareSemVer(version, input.max) > 0) {
    return false;
  }
  return true;
}
