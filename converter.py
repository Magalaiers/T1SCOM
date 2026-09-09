import os
import json
import pandas as pd
from datetime import datetime

# Ano canônico de lançamento do simulador
ANO_BASE = 2016

def limpar_texto(txt):
    if pd.isna(txt):
        return ""
    txt = str(txt).strip()
    try:
        return txt.encode('latin1').decode('utf-8').strip()
    except (UnicodeEncodeError, UnicodeDecodeError):
        return txt

def obter_nacionalidade(row):
    for col_nome in ['Nationality', 'Country', 'Nation', 'Nacionalidade']:
        if col_nome in row and pd.notna(row[col_nome]):
            val = limpar_texto(row[col_nome])
            if val and val.lower() not in ['nan', 'none', '']:
                return val

    if len(row) > 2 and pd.notna(row.iloc[2]):
        val = limpar_texto(row.iloc[2])
        if val and val.lower() not in ['nan', 'none', '']:
            return val

    return "Unknown"

def obter_series_preference(row, colunas_df):
    val_bruto = None
    for nome_col in ['Series Preference', 'SeriesPreference', 'Preference', 'Series']:
        if nome_col in row and pd.notna(row[nome_col]):
            val_bruto = row[nome_col]
            break

    if val_bruto is None:
        for c in colunas_df:
            c_low = str(c).lower().replace(" ", "").replace("_", "")
            if 'seriespreference' in c_low or 'preference' in c_low:
                if pd.notna(row[c]):
                    val_bruto = row[c]
                    break

    if val_bruto is None or str(val_bruto).strip().lower() in ['', 'nan', 'none']:
        return "Any"

    val_str = str(val_bruto).strip().lower()
    if 'single' in val_str or 'seater' in val_str or 'monoposto' in val_str or val_str == '0':
        return "Single Seater"
    elif 'gt' in val_str or val_str == '1':
        return "GT"
    elif 'endurance' in val_str or 'resistencia' in val_str or 'resistência' in val_str or val_str == '2':
        return "Endurance"
    elif 'any' in val_str or 'qualquer' in val_str or val_str == '3':
        return "Any"
    
    return str(val_bruto).strip().title()

def obter_pay_driver(row, colunas_df):
    """
    Verifica a coluna Pay Driver. Qualquer número diferente de 0 indica piloto pagante (True).
    """
    val_bruto = None
    for nome_col in ['Pay Driver', 'PayDriver', 'Pay_Driver']:
        if nome_col in row and pd.notna(row[nome_col]):
            val_bruto = row[nome_col]
            break

    if val_bruto is None:
        for c in colunas_df:
            c_low = str(c).lower().replace(" ", "").replace("_", "")
            if 'paydriver' in c_low or 'pay' in c_low:
                if pd.notna(row[c]):
                    val_bruto = row[c]
                    break

    if val_bruto is None or str(val_bruto).strip().lower() in ['', 'nan', 'none']:
        return False

    val_str = str(val_bruto).strip().replace(',', '.')
    try:
        num = float(val_str)
        return num != 0
    except ValueError:
        return val_str.lower() in ['true', 'yes', 'sim', '1']

def obter_marketability(row, colunas_df):
    """
    Lê a coluna Marketability e adiciona o símbolo de porcentagem (%).
    """
    val_bruto = None
    for nome_col in ['Marketability', 'Market', 'Apelo Comercial']:
        if nome_col in row and pd.notna(row[nome_col]):
            val_bruto = row[nome_col]
            break

    if val_bruto is None:
        for c in colunas_df:
            c_low = str(c).lower().replace(" ", "").replace("_", "")
            if 'marketability' in c_low or 'market' in c_low:
                if pd.notna(row[c]):
                    val_bruto = row[c]
                    break

    if val_bruto is None or str(val_bruto).strip().lower() in ['', 'nan', 'none']:
        return "0%"

    val_str = str(val_bruto).strip().replace('%', '').replace(',', '.')
    try:
        num = float(val_str)
        # Se estiver em decimal de 0.0 a 1.0 (ex.: 0.75), converte para 75%
        if 0 < num <= 1.0:
            pct = int(round(num * 100))
        else:
            pct = int(round(num))
        return f"{pct}%"
    except ValueError:
        return f"{val_bruto}%"

def extrair_salario_anual(row, colunas_df):
    valor_bruto = None
    for nome_col in ['Wages', 'Wage', 'Salary', 'Salario']:
        if nome_col in row and pd.notna(row[nome_col]):
            valor_bruto = row[nome_col]
            break

    if valor_bruto is None:
        for c in colunas_df:
            c_low = str(c).lower().strip()
            if 'wage' in c_low or 'sal' in c_low:
                if pd.notna(row[c]):
                    valor_bruto = row[c]
                    break

    if valor_bruto is None or str(valor_bruto).strip() in ['', 'nan', 'None']:
        return 0

    val_str = str(valor_bruto).strip().replace(',', '.')
    try:
        num = float(val_str)
        if num >= 1000.0:
            return int(round(num))
        elif num > 0:
            return int(round(num * 1_000_000))
        return 0
    except ValueError:
        return 0

def converter():
    arquivo_drivers = None
    arquivo_teams = None

    for arquivo in os.listdir('.'):
        nome_lower = arquivo.lower()
        if 'driver' in nome_lower and nome_lower.endswith('.csv'):
            arquivo_drivers = arquivo
        elif 'team' in nome_lower and nome_lower.endswith('.csv'):
            arquivo_teams = arquivo

    if not arquivo_teams or not arquivo_drivers:
        print("[-] Erro: Teams.csv ou Drivers.csv não encontrado na pasta atual.")
        return

    print(f"[+] Lendo '{arquivo_teams}' e '{arquivo_drivers}'...")
    df_teams = pd.read_csv(arquivo_teams)
    df_drivers = pd.read_csv(arquivo_drivers)

    colunas_drivers = list(df_drivers.columns)

    # 1. Mapeamento das Equipes
    equipes_lista = []
    mapa_equipes_por_id = {}
    mapa_por_linha = {}

    for idx, row in df_teams.iterrows():
        team_id = idx + 1

        nome_equipe = limpar_texto(row.get('Name', row.get('Team Name', f'Equipe {team_id}')))
        if not nome_equipe or nome_equipe.lower() in ['nan', 'none']:
            continue

        cor_prim = str(row.get('Primary Colour', row.get('Colour 1', '#1e222b'))).strip()
        cor_sec = str(row.get('Secondary Colour', row.get('Colour 2', '#f5f6f8'))).strip()
        if not cor_prim.startswith('#'):
            cor_prim = f"#{cor_prim}"
        if not cor_sec.startswith('#'):
            cor_sec = f"#{cor_sec}"

        pais_equipe = obter_nacionalidade(row)
        campeonato_id = int(row.get('Championship ID', 1)) if pd.notna(row.get('Championship ID')) else 1

        equipe_obj = {
            "id": team_id,
            "nome": nome_equipe,
            "pais": pais_equipe,
            "campeonato_id": campeonato_id,
            "cor_primaria": cor_prim[:7],
            "cor_secundaria": cor_sec[:7]
        }

        equipes_lista.append(equipe_obj)
        mapa_equipes_por_id[team_id] = equipe_obj

        if pd.notna(row.get('ID')):
            try:
                mapa_por_linha[int(float(row.get('ID')))] = team_id
            except ValueError:
                pass
        mapa_por_linha[idx] = team_id

    print(f"[+] Equipes mapeadas: {len(equipes_lista)} times.")

    # 2. Mapeamento dos Pilotos
    pilotos_lista = []

    for idx, row in df_drivers.iterrows():
        p_nome = limpar_texto(row.get('First Name', ''))
        u_nome = limpar_texto(row.get('Last Name', ''))
        nome_completo = f"{p_nome} {u_nome}".strip()
        if not nome_completo or nome_completo.lower() == 'nan':
            nome_completo = limpar_texto(row.get('Name', f'Piloto {idx + 1}'))

        if not nome_completo or nome_completo.lower() == 'nan':
            continue

        nacionalidade_piloto = obter_nacionalidade(row)
        series_pref = obter_series_preference(row, colunas_drivers)
        pay_driver = obter_pay_driver(row, colunas_drivers)
        marketability = obter_marketability(row, colunas_drivers)

        # Idade baseada em 2016
        idade = 25
        dob = row.get('Date of Birth', row.get('DOB', row.get('Birth Date')))
        if pd.notna(dob):
            try:
                idade = ANO_BASE - pd.to_datetime(dob).year
            except Exception:
                idade = 25
        elif pd.notna(row.get('Age')):
            try:
                idade = int(float(row.get('Age')))
            except ValueError:
                idade = 25

        # Offset de -1 da Equipe
        raw_team = row.get('Team', row.get('Team ID', row.get('Contracted Team')))
        equipe_id_final = None

        if pd.notna(raw_team):
            try:
                num_driver_team = int(float(raw_team))
                id_tentativa = num_driver_team - 1

                if id_tentativa in mapa_equipes_por_id:
                    equipe_id_final = id_tentativa
                elif num_driver_team in mapa_por_linha:
                    equipe_id_final = mapa_por_linha[num_driver_team]
            except ValueError:
                pass

        status_contrato = "Contratado" if equipe_id_final is not None else "Disponível"
        salario_anual = extrair_salario_anual(row, colunas_drivers)

        # 9 Atributos
        atributos = {
            "frenagem": int(float(row.get('Braking', 10))),
            "curva": int(float(row.get('Cornering', 10))),
            "suavidade": int(float(row.get('Smoothness', 10))),
            "ultrapassagem": int(float(row.get('Overtaking', 10))),
            "consistencia": int(float(row.get('Consistency', 10))),
            "adaptabilidade": int(float(row.get('Adaptability', 10))),
            "preparo_fisico": int(float(row.get('Fitness', 10))),
            "feedback": int(float(row.get('Feedback', 10))),
            "foco": int(float(row.get('Focus', 10)))
        }

        media_attr = sum(atributos.values()) / 9.0
        escala_max = 100.0 if max(atributos.values()) > 20 else 20.0
        estrelas_atuais = round(min(5.0, max(0.5, (media_attr / escala_max) * 5.0)), 1)

        raw_pot = row.get('Potential', row.get('Stars'))
        if pd.notna(raw_pot):
            try:
                val_pot = float(raw_pot)
                if val_pot > 20:
                    estrelas_pot = round((val_pot / 100.0) * 5.0, 1)
                elif val_pot > 5:
                    estrelas_pot = round((val_pot / 20.0) * 5.0, 1)
                else:
                    estrelas_pot = round(val_pot, 1)
            except ValueError:
                estrelas_pot = estrelas_atuais
        else:
            estrelas_pot = round(min(5.0, estrelas_atuais + 0.5), 1)

        estrelas_pot = max(estrelas_atuais, min(5.0, estrelas_pot))
        driver_id = int(row.get('ID', idx + 1)) if pd.notna(row.get('ID')) else idx + 1

        pilotos_lista.append({
            "id": driver_id,
            "nome": nome_completo,
            "nacionalidade": nacionalidade_piloto,
            "idade": int(idade),
            "series_preference": series_pref,
            "pay_driver": pay_driver,
            "marketability": marketability,
            "equipe_id": equipe_id_final,
            "status_contrato": status_contrato,
            "salario_anual": salario_anual,
            "estrelas_atuais": estrelas_atuais,
            "estrelas_potencial": estrelas_pot,
            "atributos": atributos
        })

    dados_finais = {
        "campeonatos": [
            {"id": 1, "nome": "World Motorsport Championship", "tipo": "Single Seater", "categoria": "Tier 1"},
            {"id": 2, "nome": "Asia-Pacific Super Cup", "tipo": "Single Seater", "categoria": "Tier 2"},
            {"id": 3, "nome": "European Racing Series", "tipo": "Single Seater", "categoria": "Tier 3"},
            {"id": 4, "nome": "International GT Championship", "tipo": "GT", "categoria": "Tier 1"},
            {"id": 5, "nome": "GT Challenger Series", "tipo": "GT", "categoria": "Tier 2"},
            {"id": 6, "nome": "International Endurance Cup (Class A)", "tipo": "Endurance", "categoria": "Tier 1"},
            {"id": 7, "nome": "International Endurance Cup (Class B)", "tipo": "Endurance", "categoria": "Tier 2"}
        ],
        "equipes": equipes_lista,
        "pilotos": pilotos_lista
    }

    with open("dados.json", "w", encoding="utf-8") as f:
        json.dump(dados_finais, f, indent=2, ensure_ascii=False)

    print(f"\n[✔] dados.json gerado com sucesso!")
    print("\n--- Amostra com Pay Driver e Marketability ---")
    for p in pilotos_lista[:5]:
        status_pay = "Sim (💰)" if p['pay_driver'] else "Não"
        print(f"Piloto: {p['nome']:<20} | Marketability: {p['marketability']:<6} | Pagante: {status_pay}")

if __name__ == "__main__":
    converter()