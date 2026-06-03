# integration-huron-person/src/data-mapper: Data Transformation Patterns

## Purpose
Implements field-level data transformation and validation for person records. Converts source data format to target format.

## Harnesses (5 total)

### 1. DataMapper (Base)
**Purpose**: Foundation data mapping with field transformations

**Environment Prefix**: DATA_MAPPER

**Location**: `DataMapper.ts`

**Operations**:
- Field name translation (source → target format)
- Type conversion (string → date, etc.)
- Value normalization
- Conditional logic

### 2. DataMapperCountry
**Purpose**: Country code/name mapping

**Environment Prefix**: DATA_MAPPER_COUNTRY

**Location**: `DataMapperCountry.ts`

**Mapping**:
- ISO 3166-1 country codes
- Country names
- Locale handling

### 3. DataMapperOrganization
**Purpose**: Organizational unit mapping

**Environment Prefix**: DATA_MAPPER_ORGANIZATION

**Location**: `DataMapperOrganization.ts`

**Mapping**:
- Dept/college hierarchy
- Cost centers
- Reporting relationships

### 4. DataMapperState
**Purpose**: US state abbreviation/full name mapping

**Environment Prefix**: DATA_MAPPER_STATE

**Location**: `DataMapperState.ts`

### 5. FieldFilter
**Purpose**: Include/exclude fields based on configuration

**Environment Prefix**: FIELD_FILTER

**Location**: `FieldFilter.ts`

**Operations**:
- Whitelist fields (include only these)
- Blacklist fields (exclude these)
- Conditional inclusion (include if matches criteria)

## Mapping Configuration

### Source Format (Huron IRB)
```json
{
  "person_id": "P123456",
  "person_name": "Alice Smith",
  "country_code": "USA",
  "state_code": "MA",
  "org_name": "College of Arts and Sciences"
}
```

### Target Format (HRS)
```json
{
  "id": "P123456",
  "name": "Alice Smith",
  "country": "United States",
  "state": "Massachusetts",
  "organization": "CAS"
}
```

### Mapper Implementation

```typescript
export class DataMapper {
  private config: MappingConfig;

  constructor(config: MappingConfig) {
    this.config = config;
  }

  map(sourcePerson: SourcePerson): TargetPerson {
    const mapped = {
      // Field transformation
      id: sourcePerson.person_id,
      name: this.normalizePersonName(sourcePerson.person_name),
      
      // Country mapping
      country: this.countryMapper.map(sourcePerson.country_code),
      
      // State mapping
      state: this.stateMapper.map(sourcePerson.state_code),
      
      // Organization mapping
      organization: this.orgMapper.map(sourcePerson.org_name),
      
      // Conditional fields
      ...(sourcePerson.email && { email: sourcePerson.email })
    };
    
    // Apply field filter
    return this.fieldFilter.filter(mapped);
  }
  
  private normalizePersonName(name: string): string {
    return name.trim().replace(/\s+/g, ' ');
  }
}
```

## Adding New Mappings

1. **Create new mapper file** in this directory
2. **Extend Mapper base class** if applicable
3. **Add test harness** with require.main block
4. **Add environment variables** to .env
5. **Document mapping logic** in file

## Testing Mappers

```bash
# Test field mapping
npx ts-node src/data-mapper/DataMapper.ts

# Test country mapping
npx ts-node src/data-mapper/DataMapperCountry.ts

# Test field filtering
npx ts-node src/data-mapper/FieldFilter.ts
```

## Common Mapping Patterns

### Simple Field Rename
```typescript
const target = { id: source.person_id };
```

### Lookup Table
```typescript
const countryMap = { 'USA': 'United States', 'CAN': 'Canada' };
const target = { country: countryMap[source.country_code] };
```

### Conditional Transformation
```typescript
const target = {
  status: source.is_active ? 'active' : 'inactive'
};
```

### Format Conversion
```typescript
const target = {
  birth_date: new Date(source.birth_date).toISOString()
};
```

