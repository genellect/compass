from __future__ import annotations

from sqlalchemy import and_, case

from app.db.models import LibraryMember


ROSTER_GRADE_LABELS = (
    "1年",
    "2年",
    "3年",
    "4年",
    "5年",
    "6年",
    "M1",
    "M2",
    "その他",
)


def roster_grade_label(academic_role: str, grade: str | None) -> str:
    """Return the public roster grade without changing eligibility storage."""
    if academic_role == "undergraduate" and grade in {"1", "2", "3", "4", "5", "6"}:
        return f"{grade}年"
    if academic_role == "master" and grade in {"1", "2"}:
        return f"M{grade}"
    return "その他"


def roster_grade_rank_expression():
    """Build a portable SQL ordering expression for the canonical grade order."""
    return case(
        *(
            (
                and_(
                    LibraryMember.academic_role == "undergraduate",
                    LibraryMember.grade == str(year),
                ),
                year,
            )
            for year in range(1, 7)
        ),
        (
            and_(
                LibraryMember.academic_role == "master",
                LibraryMember.grade == "1",
            ),
            7,
        ),
        (
            and_(
                LibraryMember.academic_role == "master",
                LibraryMember.grade == "2",
            ),
            8,
        ),
        else_=9,
    )
