# Resume customization contract

The Actor gives OpenAI the source resume, one normalized job record, a fixed section order, and explicit integrity rules. The model must return JSON matching the schema in `src/resume.ts`; it never returns executable LaTeX or free-form document markup.

## Section structure

1. Header: name, contact line, and role-specific headline
2. Profile: concise, source-supported positioning
3. Education: institution, degree, dates, location, and factual details
4. Technical skills: categorized lists rather than a keyword dump
5. Experience: unchanged employer, title, chronology, and location with rewritten evidence bullets
6. Projects: source-supported technologies, links, and concise bullets
7. Coding profiles: source-supported platform labels and links
8. Achievements: only source-supported distinctions

## Integrity metadata

The `targeting` object is stored privately with the generated PDF but is not printed on the resume. It records:

- the target role
- job keywords supported by the source resume
- unsupported keywords deliberately omitted
- checks covering identity, chronology, employment, education, skills, metrics, and links

This metadata supports review and later form filling. It is not an ATS score and does not guarantee screening outcomes.

## Privacy

The repository contains only the generic schema and fictional examples. A real source resume is supplied at runtime through a private Actor Task. Generated structured JSON and PDFs remain in private Apify key-value storage under run-specific keys.
