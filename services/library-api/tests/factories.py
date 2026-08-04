from app.schemas import AccountFacts, RegistrationInput


def student_account(
    *,
    email: str = "student@st.kitasato-u.ac.jp",
    verified: bool = True,
    token_valid: bool = True,
    email_verified: bool = True,
    hosted_domain: str = "kitasato-u.ac.jp",
) -> AccountFacts:
    return AccountFacts(
        verified=verified,
        token_valid=token_valid,
        email_verified=email_verified,
        email=email,
        hosted_domain=hosted_domain,
        allowed_hosted_domains=["kitasato-u.ac.jp"],
    )


def student_registration(
    *,
    full_name: str = "北里 花子",
    student_number: str = "PP23000",
    faculty: str = "pharmacy",
    grade: str = "3",
) -> RegistrationInput:
    return RegistrationInput(
        full_name=full_name,
        academic_role="undergraduate",
        faculty=faculty,
        grade=grade,
        student_number=student_number,
        terms_accepted=True,
        privacy_accepted=True,
        question="",
    )
