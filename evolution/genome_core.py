"""GENOME MODULE — автоматически перезаписывается движком эволюции.

Функция hot_path() — «горячий код» организма: движок исполняет её в
собственном цикле жизни (metabolism). Каждый install перезаписывает этот
файл, и программа продолжает работать уже на улучшенном коде.

This file is rewritten automatically by the evolution engine.
"""

DEFAULT_COEFFS = [1.5, -0.7, 0.35, -0.21, 0.11, -0.05, 0.017, -0.004, 0.0009]


def hot_path(xs, coeffs=None):
    if coeffs is None:
        coeffs = DEFAULT_COEFFS
    total = 0.0
    for x in xs:
        for i in range(len(coeffs)):
            total += coeffs[i] * (x ** i)
    return total
