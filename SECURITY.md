# Security

CanvasPilot is a local desktop tool. Its journals, captures, and drafts are not encrypted at rest. Protect the device and review exported text, source titles, and paths before sharing. API keys use OS-backed encryption where available; otherwise they remain in memory for that launch.

AI enhancement sends journal text and source metadata to the provider selected by the user. Screenshot pixels stay local. A custom provider URL is a deliberate trust choice.

Redaction permanently flattens the current image when applied. Earlier versions kept reversible edit history. Reopen and save old redacted screenshots before sharing their session folders, and separately review source files and backups.

Report suspected vulnerabilities privately to the repository maintainer using the private reporting/contact mechanism provided by the hosting service. Do not include real API keys, private screenshots, journals, or signing material in public issues. Include the app version, OS, a minimal reproduction with fictional data, and the expected/actual behavior.

Before releasing, run `npm audit`, `npm run check:public`, and `npm run build`; also exercise capture, annotations, exports, and provider settings on the target operating system with fictional data. The publication check catches selected private-file and credential patterns; it is not a comprehensive secret scanner. Review the staged files and scan Git history before publishing. Local development signatures are not public distribution signing or Apple notarization.
