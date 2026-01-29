import React, { useState, useEffect } from 'react';
import { Calendar, Save, ChevronRight, ChevronLeft, Edit2, X, Check, Download, Cloud, Trash2 } from 'lucide-react';
import { db, auth } from './firebase';
import { collection, doc, setDoc, getDocs, deleteDoc, getDoc } from 'firebase/firestore';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';

const App = () => {
  const [currentView, setCurrentView] = useState('paso1');
  const [showCalendar, setShowCalendar] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState(null);
  const [showMonthlyHistory, setShowMonthlyHistory] = useState(false);
  const [completedSteps, setCompletedSteps] = useState({
    paso1: false,
    paso2: false
  });
  
  // Fecha actual REAL (sin simulador)
  const [currentDate] = useState(new Date().toISOString().split('T')[0]);
  
  // 🆕 Estado para saber si el día actual ya fue guardado
  const [isDayCompleted, setIsDayCompleted] = useState(false);
  
  // 🆕 Estado para controlar el mes actual
  const [currentMonth, setCurrentMonth] = useState(currentDate.slice(0, 7)); // "YYYY-MM"
  
  // 🆕 Estado para último día del mes
  const [isLastDayOfMonth, setIsLastDayOfMonth] = useState(false);
  
  // Estado para datos del día actual
  const [todayData, setTodayData] = useState({
    date: currentDate,
    paso1: { dato1: '', dato2: '', total: 0, acumuladoAnterior: 0, acumulado: 0 },
    paso2: { dato1: '', dato2: '', total: 0, acumuladoAnterior: 0, acumulado: 0 },
    porcentaje: 0
  });

  // Datos históricos
  const [historicalData, setHistoricalData] = useState({});
  
  // Datos mensuales (resumen de cada mes)
  const [monthlyData, setMonthlyData] = useState({});

  // Estado de carga, errores y Firebase
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  const [cloudStatus, setCloudStatus] = useState('⏳ Conectando...');

  // ===================== DETECCIÓN DE CAMBIO DE MES =====================
  useEffect(() => {
    const checkMonthAndLastDay = () => {
      const today = new Date();
      const year = today.getFullYear();
      const month = today.getMonth() + 1;
      
      // Verificar si es último día del mes
      const lastDayOfMonth = new Date(year, month, 0).getDate();
      const isLastDay = today.getDate() === lastDayOfMonth;
      setIsLastDayOfMonth(isLastDay);
      
      // Verificar cambio de mes
      const newMonth = `${year}-${month.toString().padStart(2, '0')}`;
      
      if (newMonth !== currentMonth) {
        console.log(`🔄 ¡Cambió el mes! De ${currentMonth} a ${newMonth}`);
        
        // Actualizar el mes actual
        setCurrentMonth(newMonth);
        
        // Resetear acumulados para el nuevo mes
        setTodayData(prev => ({
          ...prev,
          date: currentDate,
          paso1: { dato1: '', dato2: '', total: 0, acumuladoAnterior: 0, acumulado: 0 },
          paso2: { dato1: '', dato2: '', total: 0, acumuladoAnterior: 0, acumulado: 0 },
          porcentaje: 0
        }));
        
        setIsDayCompleted(false);
        setCompletedSteps({ paso1: false, paso2: false });
        setCurrentView('paso1');
        
        // Mostrar mensaje informativo
        alert(`📅 ¡Nuevo mes comenzado! (${newMonth})\n\nLos acumulados se han reiniciado a CERO.\nPuedes comenzar a registrar datos del nuevo mes.\n\n💡 El mes anterior (${currentMonth}) sigue disponible para exportar manualmente desde el historial.`);
      }
    };
    
    // Ejecutar al cargar y cada minuto para detectar cambios de mes
    checkMonthAndLastDay();
    const interval = setInterval(checkMonthAndLastDay, 60000); // Verificar cada minuto
    
    return () => clearInterval(interval);
  }, [currentDate, currentMonth]);

  // ===================== FUNCIÓN MEJORADA: RESETEAR MES ACTUAL =====================
  const resetCurrentMonth = async () => {
    // Mostrar confirmación específica para el mes actual
    const confirmReset = window.confirm(
      `⚠️ ¿REINICIAR MES ${currentMonth}?\n\n` +
      `Esta acción eliminará SOLO los datos del mes ${currentMonth}:\n` +
      `• Todos los días registrados en ${currentMonth}\n` +
      `• Los acumulados actuales de ${currentMonth}\n\n` +
      '🚫 NO se eliminarán:\n' +
      '• Meses anteriores (quedan en historial)\n' +
      '• JSONs de meses completados\n' +
      '• Resúmenes mensuales anteriores\n\n' +
      'Después del reinicio:\n' +
      `• Comenzarás ${currentMonth} desde CERO\n` +
      '• Podrás registrar nuevos datos normalmente\n' +
      '• Los meses anteriores seguirán disponibles\n\n' +
      '¿Continuar?'
    );

    if (!confirmReset) {
      return; // El usuario canceló
    }

    try {
      setLoading(true);
      setCloudStatus(`🔄 Reiniciando mes ${currentMonth}...`);

      // 1. Eliminar SOLO datos del mes actual de Firebase
      if (user) {
        try {
          // Buscar todos los días del mes actual en los datos históricos
          const monthDays = Object.keys(historicalData).filter(date => 
            date.startsWith(currentMonth)
          );
          
          console.log(`🗑️ Eliminando ${monthDays.length} días del mes ${currentMonth} de Firebase`);
          
          // Eliminar cada día del mes actual de Firebase
          for (const date of monthDays) {
            await deleteFromFirebase('historicalData', date);
          }
          
          console.log(`✅ Datos del mes ${currentMonth} eliminados de Firebase`);
          
          // También eliminar resumen mensual de este mes si existe
          if (monthlyData[currentMonth]) {
            await deleteFromFirebase('monthlyData', currentMonth);
            console.log(`✅ Resumen del mes ${currentMonth} eliminado de Firebase`);
          }
          
        } catch (firebaseError) {
          console.warn(`⚠️ No se pudieron eliminar datos del mes ${currentMonth}:`, firebaseError);
        }
      }

      // 2. Filtrar datos históricos - mantener solo meses anteriores
      const newHistoricalData = {};
      Object.entries(historicalData).forEach(([date, data]) => {
        if (!date.startsWith(currentMonth)) {
          newHistoricalData[date] = data;
        }
      });
      setHistoricalData(newHistoricalData);

      // 3. Filtrar datos mensuales - mantener solo meses anteriores
      const newMonthlyData = {};
      Object.entries(monthlyData).forEach(([month, data]) => {
        if (month !== currentMonth) {
          newMonthlyData[month] = data;
        }
      });
      setMonthlyData(newMonthlyData);

      // 4. Resetear datos del día actual desde CERO
      setTodayData({
        date: currentDate,
        paso1: { dato1: '', dato2: '', total: 0, acumuladoAnterior: 0, acumulado: 0 },
        paso2: { dato1: '', dato2: '', total: 0, acumuladoAnterior: 0, acumulado: 0 },
        porcentaje: 0
      });
      
      // 5. Resetear estados del día actual
      setIsDayCompleted(false);
      setCompletedSteps({ paso1: false, paso2: false });
      setCurrentView('paso1');
      
      // 6. Limpiar vistas temporales
      setSelectedDate(null);
      setIsEditing(false);
      setEditData(null);

      // 7. Mostrar mensaje de éxito
      setCloudStatus(`✅ Mes ${currentMonth} reiniciado - Listo para comenzar`);
      
      // Mensaje informativo
      alert(`✅ Mes ${currentMonth} reiniciado exitosamente\n\n` +
            `Los datos de ${currentMonth} han sido eliminados.\n` +
            `Ahora puedes registrar nuevos datos desde HOY.\n\n` +
            `📊 Los meses anteriores siguen disponibles en:\n` +
            `• Historial de Meses (para ver resúmenes)\n` +
            `• Calendario (para ver días específicos)\n` +
            `• Exportar JSON (para backup)`);

      setLoading(false);

    } catch (error) {
      console.error(`❌ Error al reiniciar el mes ${currentMonth}:`, error);
      setCloudStatus(`❌ Error al reiniciar mes`);
      alert('❌ Hubo un error al intentar reiniciar el mes.\nPor favor, intenta nuevamente.');
      setLoading(false);
    }
  };

  // ===================== FUNCIÓN NUEVA: EXPORTAR MES ANTERIOR =====================
  const exportPreviousMonth = () => {
    try {
      const previousMonth = getPreviousMonth();
      const monthData = monthlyData[previousMonth];
      
      if (!monthData) {
        alert(`ℹ️ No hay datos consolidados para el mes ${previousMonth}.\n\nPuedes exportar los datos de los meses que hayan sido consolidados en la sección de exportación general.`);
        return;
      }
      
      const exportObj = {
        fechaExportacion: new Date().toISOString(),
        mes: previousMonth,
        datosMensuales: monthData,
        informacion: {
          diasRegistrados: monthData.informacionConsolidada.diasTotales,
          primerDia: monthData.informacionConsolidada.primerDia,
          ultimoDia: monthData.informacionConsolidada.ultimoDia,
          totalGeneral: formatCurrency(monthData.acumuladoGeneral.total),
          porcentajeFinal: monthData.porcentajeFinal
        }
      };
      
      const dataStr = JSON.stringify(exportObj, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
      
      const exportFileName = `mes-${previousMonth}-resumen.json`;
      
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileName);
      linkElement.click();
      
      alert(`📥 Mes ${previousMonth} exportado exitosamente.`);
    } catch (error) {
      console.error('Error exportando mes anterior:', error);
      alert('❌ Error al exportar el mes anterior.');
    }
  };

  // ===================== FUNCIÓN AUXILIAR: OBTENER MES ANTERIOR =====================
  const getPreviousMonth = () => {
    const [year, month] = currentMonth.split('-').map(Number);
    let prevYear = year;
    let prevMonth = month - 1;
    
    if (prevMonth === 0) {
      prevMonth = 12;
      prevYear = year - 1;
    }
    
    return `${prevYear}-${prevMonth.toString().padStart(2, '0')}`;
  };

  // 🆕 Efecto para actualizar todayData cuando se carga historicalData
useEffect(() => {
  if (!loading && historicalData[currentDate]) {
    console.log('🔄 Actualizando todayData con datos del día actual desde historicalData');
    const dayData = historicalData[currentDate];
    
    // 🆕 CORRECCIÓN: Cargar TODOS los datos, no solo algunos
    setTodayData({
      date: currentDate,
      paso1: {
        dato1: dayData.paso1.dato1 || '',
        dato2: dayData.paso1.dato2 || '',
        total: dayData.paso1.total || 0,
        acumuladoAnterior: dayData.paso1.acumuladoAnterior || 0,
        acumulado: dayData.paso1.acumulado || 0
      },
      paso2: {
        dato1: dayData.paso2.dato1 || '',
        dato2: dayData.paso2.dato2 || '',
        total: dayData.paso2.total || 0,
        acumuladoAnterior: dayData.paso2.acumuladoAnterior || 0,
        acumulado: dayData.paso2.acumulado || 0
      },
      porcentaje: dayData.porcentaje || 0
    });
    
    setIsDayCompleted(true);
    setCompletedSteps({ paso1: true, paso2: true });
    setCurrentView('resumen');
  }
}, [historicalData, currentDate, loading]);

  // 🆕 Función para verificar si el día actual ya fue guardado
const checkIfTodayIsCompleted = async () => {
  try {
    console.log('🔄 Verificando si el día actual está completado...', currentDate);
    
    // Verificar primero en historicalData que ya se cargó
    if (historicalData && historicalData[currentDate]) {
      console.log('✅ Día actual encontrado en historicalData en memoria');
      const data = historicalData[currentDate];
      
      // 🆕 CORRECCIÓN CRÍTICA: Cargar TODOS los datos en todayData
      setTodayData({
        date: currentDate,
        paso1: {
          dato1: data.paso1.dato1 || '',
          dato2: data.paso1.dato2 || '',
          total: data.paso1.total || 0,
          acumuladoAnterior: data.paso1.acumuladoAnterior || 0,
          acumulado: data.paso1.acumulado || 0
        },
        paso2: {
          dato1: data.paso2.dato1 || '',
          dato2: data.paso2.dato2 || '',
          total: data.paso2.total || 0,
          acumuladoAnterior: data.paso2.acumuladoAnterior || 0,
          acumulado: data.paso2.acumulado || 0
        },
        porcentaje: data.porcentaje || 0
      });
      
      setIsDayCompleted(true);
      setCompletedSteps({ paso1: true, paso2: true });
      setCurrentView('resumen');
      
      return true;
    }

    // Si no está en memoria, verificar en Firebase
    if (user) {
      try {
        const docRef = doc(db, 'users', user.uid, 'historicalData', currentDate);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          console.log('✅ Día actual encontrado en Firebase');
          const data = docSnap.data();
          
          // Actualizar historicalData en memoria
          setHistoricalData(prev => ({
            ...prev,
            [currentDate]: data
          }));
          
          // 🆕 CORRECCIÓN CRÍTICA: Cargar TODOS los datos en todayData
          setTodayData({
            date: currentDate,
            paso1: {
              dato1: data.paso1.dato1 || '',
              dato2: data.paso1.dato2 || '',
              total: data.paso1.total || 0,
              acumuladoAnterior: data.paso1.acumuladoAnterior || 0,
              acumulado: data.paso1.acumulado || 0
            },
            paso2: {
              dato1: data.paso2.dato1 || '',
              dato2: data.paso2.dato2 || '',
              total: data.paso2.total || 0,
              acumuladoAnterior: data.paso2.acumuladoAnterior || 0,
              acumulado: data.paso2.acumulado || 0
            },
            porcentaje: data.porcentaje || 0
          });
          
          setIsDayCompleted(true);
          setCompletedSteps({ paso1: true, paso2: true });
          setCurrentView('resumen');
          
          return true;
        }
      } catch (firebaseError) {
        console.log('ℹ️ Error al conectar con Firebase para verificar día actual');
      }
    }

    console.log('ℹ️ Día actual NO encontrado - listo para registrar');
    setIsDayCompleted(false);
    
    // Cargar datos del día anterior del MISMO MES
    loadPreviousDayData();
    
    return false;
  } catch (error) {
    console.error('Error verificando día actual:', error);
    setIsDayCompleted(false);
    
    // Intentar cargar datos del día anterior
    loadPreviousDayData();
    
    return false;
  }
};

  // Cargar datos iniciales CON FIREBASE
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setLoading(true);
        
        // 1. USAR SIEMPRE EL MISMO USUARIO ID (el que tiene tus datos)
        const FIXED_USER_ID = 'bEY1p1kgVjgk88AlCGa7nM6I1de2';
        
        try {
          // Crear objeto de usuario simulado con el ID fijo
          const fixedUser = { uid: FIXED_USER_ID };
          setUser(fixedUser);
          setCloudStatus('✅ Conectado a la nube');
          
          // 2. Cargar datos de Firebase con el ID fijo
          await loadDataFromFirebase(FIXED_USER_ID);
          
        } catch (firebaseError) {
          console.log('Firebase no disponible, usando modo local');
          setCloudStatus('⚠️ Usando modo local');
        }
        
        // 3. 🆕 Verificar si el día actual ya está guardado
        setTimeout(async () => {
          await checkIfTodayIsCompleted();
          setLoading(false);
        }, 500);
        
      } catch (err) {
        setError('Error al cargar los datos');
        console.error('Error loading data:', err);
        setLoading(false);
      }
    };
    
    loadInitialData();
  }, [currentDate]);

  // 🆕 Efecto para cargar día anterior después de verificar el día actual
  useEffect(() => {
    if (!loading && !isDayCompleted && Object.keys(historicalData).length >= 0) {
      if (Object.keys(historicalData).length > 0) {
        console.log('📊 Cargando acumulados desde datos históricos');
        loadPreviousDayData();
      }
    }
  }, [loading, isDayCompleted, historicalData]);

  // Función para cargar datos desde Firebase
  const loadDataFromFirebase = async (userId) => {
    try {
      // Cargar datos históricos
      const historicalRef = collection(db, 'users', userId, 'historicalData');
      const historicalSnapshot = await getDocs(historicalRef);
      
      const historical = {};
      historicalSnapshot.forEach(doc => {
        historical[doc.id] = doc.data();
      });
      
      // Cargar datos mensuales
      const monthlyRef = collection(db, 'users', userId, 'monthlyData');
      const monthlySnapshot = await getDocs(monthlyRef);
      
      const monthly = {};
      monthlySnapshot.forEach(doc => {
        monthly[doc.id] = doc.data();
      });
      
      // Actualizar estados
      setHistoricalData(historical);
      setMonthlyData(monthly);
      
      console.log('✅ Datos cargados desde Firebase:', {
        diasHistoricos: Object.keys(historical).length,
        mesesConsolidados: Object.keys(monthly).length
      });
      
    } catch (error) {
      console.error('Error cargando de Firebase:', error);
      throw error;
    }
  };

  // Función para guardar en Firebase
  const saveToFirebase = async (collectionName, documentId, data) => {
    if (!user) return false;
    
    try {
      const docRef = doc(db, 'users', user.uid, collectionName, documentId);
      await setDoc(docRef, data, { merge: true });
      console.log(`✅ Guardado en Firebase: ${collectionName}/${documentId}`);
      return true;
    } catch (error) {
      console.error('Error guardando en Firebase:', error);
      return false;
    }
  };

  // Función para eliminar de Firebase
  const deleteFromFirebase = async (collectionName, documentId) => {
    if (!user) return false;
    
    try {
      const docRef = doc(db, 'users', user.uid, collectionName, documentId);
      await deleteDoc(docRef);
      return true;
    } catch (error) {
      console.error('Error eliminando de Firebase:', error);
      return false;
    }
  };

  // Guardar resumen del mes con JSON consolidado
  const saveMonthSummary = async (monthKey) => {
    try {
      const monthDays = Object.entries(historicalData).filter(([date]) => 
        date.startsWith(monthKey)
      );
      
      if (monthDays.length === 0) return;
      
      // Ordenar los días cronológicamente
      monthDays.sort((a, b) => a[0].localeCompare(b[0]));
      
      let totalDiarioPaso1 = 0;
      let totalDiarioPaso2 = 0;
      const diasRegistrados = [];
      
      // Obtener los últimos acumulados (los del último día del mes)
      const ultimoDia = monthDays[monthDays.length - 1];
      const acumuladoFinalPaso1 = ultimoDia[1].paso1.acumulado;
      const acumuladoFinalPaso2 = ultimoDia[1].paso2.acumulado;
      
      monthDays.forEach(([date, data]) => {
        totalDiarioPaso1 += data.paso1.total;
        totalDiarioPaso2 += data.paso2.total;
        
        diasRegistrados.push({
          fecha: date,
          paso1: {
            dato1: parseFloat(data.paso1.dato1) || 0,
            dato2: parseFloat(data.paso1.dato2) || 0,
            totalDia: data.paso1.total,
            acumuladoHastaDia: data.paso1.acumulado
          },
          paso2: {
            dato1: parseFloat(data.paso2.dato1) || 0,
            dato2: parseFloat(data.paso2.dato2) || 0,
            totalDia: data.paso2.total,
            acumuladoHastaDia: data.paso2.acumulado
          },
          porcentajeDia: data.porcentaje
        });
      });
      
      const totalGeneralDiario = totalDiarioPaso1 + totalDiarioPaso2;
      const totalGeneralAcumulado = acumuladoFinalPaso1 + acumuladoFinalPaso2;
      const porcentajeFinal = acumuladoFinalPaso1 > 0 && acumuladoFinalPaso2 > 0 
        ? (Math.min(acumuladoFinalPaso1, acumuladoFinalPaso2) / Math.max(acumuladoFinalPaso1, acumuladoFinalPaso2)) * 100 
        : 0;
      
      // JSON consolidado
      const summary = {
        mes: monthKey,
        diasRegistrados: diasRegistrados,
        totalesPorDia: {
          paso1: totalDiarioPaso1,
          paso2: totalDiarioPaso2,
          general: totalGeneralDiario
        },
        acumuladoGeneral: {
          paso1: acumuladoFinalPaso1,
          paso2: acumuladoFinalPaso2,
          total: totalGeneralAcumulado
        },
        porcentajeFinal: parseFloat(porcentajeFinal.toFixed(2)),
        fechaConsolidacion: new Date().toISOString(),
        informacionConsolidada: {
          diasTotales: monthDays.length,
          primerDia: monthDays[0][0],
          ultimoDia: monthDays[monthDays.length - 1][0]
        }
      };
      
      // Guardar en Firebase (si hay conexión)
      if (user) {
        const firebaseSuccess = await saveToFirebase('monthlyData', monthKey, summary);
        if (firebaseSuccess) {
          setCloudStatus('💾 Mes consolidado en la nube');
        }
      }
      
      setMonthlyData(prev => ({
        ...prev,
        [monthKey]: summary
      }));
      
      // No eliminar días del mes de Firebase (queda para historial)
      // Los datos permanecen en historicalData para referencia histórica
      
      // Mostrar notificación
      alert(`📅 ¡Mes ${monthKey} consolidado!\nSe han registrado ${summary.informacionConsolidada.diasTotales} días.\n\n💡 Los datos diarios permanecen en Firebase para historial.\nPuedes exportar el resumen desde el historial de meses.`);
      
    } catch (error) {
      console.error('Error saving month summary:', error);
      alert('❌ Error al consolidar el mes. Intenta nuevamente.');
    }
  };

  // Función para obtener el día anterior
  const getPreviousDay = (dateString) => {
    const date = new Date(dateString + 'T00:00:00');
    date.setDate(date.getDate() - 1);
    return date.toISOString().split('T')[0];
  };

  // Cargar datos del día anterior - SOLO DEL MISMO MES
// Cargar datos del día anterior - VERSIÓN CORREGIDA
const loadPreviousDayData = () => {
  try {
    console.log('🔄 Cargando datos del día anterior del mes actual...');
    
    // Buscar el último día con datos del MISMO MES (excluyendo hoy)
    const diasDelMes = Object.entries(historicalData)
      .filter(([date]) => date.startsWith(currentMonth) && date < currentDate)
      .sort(([dateA], [dateB]) => dateB.localeCompare(dateA)); // Orden descendente
    
    console.log('Días disponibles del mes actual:', diasDelMes.map(([date]) => date));
    
    if (diasDelMes.length > 0) {
      const ultimoDia = diasDelMes[0][1];
      console.log('📅 Último día del mes con datos:', diasDelMes[0][0]);
      
      // Cargar acumulados CORRECTAMENTE
      setTodayData(prev => ({
        ...prev,
        date: currentDate,
        paso1: {
          dato1: '',
          dato2: '',
          total: 0,
          acumuladoAnterior: ultimoDia.paso1.acumulado || 0,
          acumulado: ultimoDia.paso1.acumulado || 0
        },
        paso2: {
          dato1: '',
          dato2: '',
          total: 0,
          acumuladoAnterior: ultimoDia.paso2.acumulado || 0,
          acumulado: ultimoDia.paso2.acumulado || 0
        },
        porcentaje: 0
      }));
      
      console.log('✅ Acumulados cargados correctamente desde:', diasDelMes[0][0]);
    } else {
      console.log('ℹ️ No hay días anteriores en el mes actual, comenzando desde cero');
      setTodayData(prev => ({
        ...prev,
        date: currentDate,
        paso1: { dato1: '', dato2: '', total: 0, acumuladoAnterior: 0, acumulado: 0 },
        paso2: { dato1: '', dato2: '', total: 0, acumuladoAnterior: 0, acumulado: 0 },
        porcentaje: 0
      }));
    }

  } catch (error) {
    console.error('Error cargando datos del día anterior:', error);
    setTodayData(prev => ({
      ...prev,
      date: currentDate,
      paso1: { dato1: '', dato2: '', total: 0, acumuladoAnterior: 0, acumulado: 0 },
      paso2: { dato1: '', dato2: '', total: 0, acumuladoAnterior: 0, acumulado: 0 },
      porcentaje: 0
    }));
  }
};

  // 🆕 Función para corregir acumulados de días con errores
const corregirAcumuladosErroneos = () => {
  const diasCorregidos = [];
  
  // Obtener todos los días del mes actual ordenados
  const diasDelMes = Object.entries(historicalData)
    .filter(([date]) => date.startsWith(currentMonth))
    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB)); // Orden ascendente
  
  if (diasDelMes.length <= 1) return diasCorregidos;
  
  let acumuladoCorrectoPaso1 = 0;
  let acumuladoCorrectoPaso2 = 0;
  
  // Recalcular acumulados día por día
  for (let i = 0; i < diasDelMes.length; i++) {
    const [fecha, datos] = diasDelMes[i];
    
    // El acumulado anterior debe ser el acumulado del día anterior (si existe)
    const acumuladoAnteriorCorrectoPaso1 = i > 0 ? diasDelMes[i-1][1].paso1.acumulado : 0;
    const acumuladoAnteriorCorrectoPaso2 = i > 0 ? diasDelMes[i-1][1].paso2.acumulado : 0;
    
    // Calcular acumulado correcto
    const acumuladoCorrectoPaso1 = acumuladoAnteriorCorrectoPaso1 + datos.paso1.total;
    const acumuladoCorrectoPaso2 = acumuladoAnteriorCorrectoPaso2 + datos.paso2.total;
    
    // Verificar si hay discrepancias
    if (datos.paso1.acumuladoAnterior !== acumuladoAnteriorCorrectoPaso1 || 
        datos.paso1.acumulado !== acumuladoCorrectoPaso1 ||
        datos.paso2.acumuladoAnterior !== acumuladoAnteriorCorrectoPaso2 || 
        datos.paso2.acumulado !== acumuladoCorrectoPaso2) {
      
      // Crear versión corregida
      const datosCorregidos = {
        ...datos,
        paso1: {
          ...datos.paso1,
          acumuladoAnterior: acumuladoAnteriorCorrectoPaso1,
          acumulado: acumuladoCorrectoPaso1
        },
        paso2: {
          ...datos.paso2,
          acumuladoAnterior: acumuladoAnteriorCorrectoPaso2,
          acumulado: acumuladoCorrectoPaso2
        }
      };
      
      // Recalcular porcentaje
      if (acumuladoCorrectoPaso1 > 0 && acumuladoCorrectoPaso2 > 0) {
        const menor = Math.min(acumuladoCorrectoPaso1, acumuladoCorrectoPaso2);
        const mayor = Math.max(acumuladoCorrectoPaso1, acumuladoCorrectoPaso2);
        datosCorregidos.porcentaje = (menor / mayor) * 100;
      }
      
      // Actualizar historicalData
      setHistoricalData(prev => ({
        ...prev,
        [fecha]: datosCorregidos
      }));
      
      // Guardar en Firebase
      if (user) {
        saveToFirebase('historicalData', fecha, datosCorregidos);
      }
      
      diasCorregidos.push(fecha);
      console.log(`✅ Día ${fecha} corregido`);
    }
  }
  
  if (diasCorregidos.length > 0) {
    console.log(`📊 Días corregidos: ${diasCorregidos.join(', ')}`);
  }
  
  return diasCorregidos;
};

// Ejecutar corrección cuando se cargan los datos
useEffect(() => {
  if (!loading && Object.keys(historicalData).length > 0) {
    const diasCorregidos = corregirAcumuladosErroneos();
    if (diasCorregidos.length > 0 && diasCorregidos.includes(currentDate)) {
      // Si se corrigió el día actual, actualizar todayData
      const datosActualizados = historicalData[currentDate];
      if (datosActualizados) {
        setTodayData(datosActualizados);
      }
    }
  }
}, [loading, historicalData, currentDate, user]);

  // Función para formatear números como moneda
  const formatCurrency = (value) => {
    const num = parseFloat(value) || 0;
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(num);
  };

  // Función para parsear moneda a número
  const parseCurrency = (value) => {
    return value.replace(/[^0-9]/g, '');
  };

  // Manejar cambios en los inputs
  const handleInputChange = (paso, field, value) => {
    const numValue = parseCurrency(value);

    setTodayData(prev => {
      const newData = { ...prev };
      newData[paso][field] = numValue;

      const dato1 = parseFloat(newData[paso].dato1) || 0;
      const dato2 = parseFloat(newData[paso].dato2) || 0;

      newData[paso].total = dato1 + dato2;
      
      // Acumulado = acumulado anterior + total del día
      newData[paso].acumulado = newData[paso].acumuladoAnterior + newData[paso].total;

      return newData;
    });
  };

  // Continuar Paso 1
  const continuarPaso1 = () => {
    const { dato1, dato2 } = todayData.paso1;

    if (dato1 === '' || dato2 === '' || (parseFloat(dato1) === 0 && parseFloat(dato2) === 0)) {
      alert('⚠️ Debes ingresar al menos un valor diferente de cero en el Paso 1');
      return;
    }

    setCompletedSteps(prev => ({ ...prev, paso1: true }));
    setCurrentView('paso2');
  };

  // Continuar Paso 2
  const continuarPaso2 = () => {
    const { dato1, dato2 } = todayData.paso2;

    if (dato1 === '' || dato2 === '' || (parseFloat(dato1) === 0 && parseFloat(dato2) === 0)) {
      alert('⚠️ Debes ingresar al menos un valor diferente de cero en el Paso 2');
      return;
    }

    setCompletedSteps(prev => ({ ...prev, paso2: true }));
    setCurrentView('resumen');
  };

  // Manejar cambios en modo edición
  const handleEditInputChange = (paso, field, value) => {
    const numValue = parseCurrency(value);
    
    setEditData(prev => {
      const newData = { ...prev };
      newData[paso][field] = numValue;
      
      const dato1 = parseFloat(newData[paso].dato1) || 0;
      const dato2 = parseFloat(newData[paso].dato2) || 0;
      newData[paso].total = dato1 + dato2;
      newData[paso].acumulado = newData[paso].acumuladoAnterior + newData[paso].total;
      
      // Recalcular porcentaje
      const acum1 = newData.paso1.acumulado;
      const acum2 = newData.paso2.acumulado;
      if (acum1 > 0 && acum2 > 0) {
        const menor = Math.min(acum1, acum2);
        const mayor = Math.max(acum1, acum2);
        newData.porcentaje = (menor / mayor) * 100;
      }
      
      return newData;
    });
  };

  // Calcular porcentaje
  useEffect(() => {
    const acum1 = todayData.paso1.acumulado;
    const acum2 = todayData.paso2.acumulado;
    
    if (acum1 > 0 && acum2 > 0) {
      const menor = Math.min(acum1, acum2);
      const mayor = Math.max(acum1, acum2);
      setTodayData(prev => ({
        ...prev,
        porcentaje: (menor / mayor) * 100
      }));
    }
  }, [todayData.paso1.acumulado, todayData.paso2.acumulado]);

  // Guardar datos del día - 
const saveData = async () => {
  try {
    console.log('💾 Guardando datos para el día:', currentDate);
    
    // 🆕 Mostrar advertencia si es último día del mes
    if (isLastDayOfMonth) {
      const confirmSave = window.confirm(
        '📅 ¡ÚLTIMO DÍA DEL MES!\n\n' +
        'Estás a punto de guardar datos del último día del mes.\n\n' +
        '✅ Puedes registrar datos normalmente\n' +
        '⚠️ Mañana comenzará un nuevo mes\n' +
        '📊 El resumen del mes estará disponible para exportar manualmente\n\n' +
        '¿Continuar con el guardado?'
      );
      
      if (!confirmSave) {
        return;
      }
    }
    
    // 🆕 CORRECCIÓN CRÍTICA: Buscar el acumulado anterior del ÚLTIMO DÍA registrado del MISMO MES
    const diasDelMes = Object.entries(historicalData)
      .filter(([date]) => date.startsWith(currentMonth) && date < currentDate)
      .sort(([dateA], [dateB]) => dateB.localeCompare(dateA)); // Orden descendente
    
    let acumuladoAnteriorPaso1 = 0;
    let acumuladoAnteriorPaso2 = 0;
    
    if (diasDelMes.length > 0) {
      // Tomar el día más reciente (último día con datos)
      const ultimoDia = diasDelMes[0][1];
      acumuladoAnteriorPaso1 = ultimoDia.paso1.acumulado || 0;
      acumuladoAnteriorPaso2 = ultimoDia.paso2.acumulado || 0;
      
      console.log('📊 Acumulado anterior encontrado del día:', diasDelMes[0][0], {
        paso1: acumuladoAnteriorPaso1,
        paso2: acumuladoAnteriorPaso2
      });
    } else {
      console.log('ℹ️ No hay días anteriores en el mes actual, comenzando desde cero');
    }
    
    // Calcular los nuevos acumulados CORRECTAMENTE
    const totalDiaPaso1 = parseFloat(todayData.paso1.dato1 || 0) + parseFloat(todayData.paso1.dato2 || 0);
    const totalDiaPaso2 = parseFloat(todayData.paso2.dato1 || 0) + parseFloat(todayData.paso2.dato2 || 0);
    
    const nuevoAcumuladoPaso1 = acumuladoAnteriorPaso1 + totalDiaPaso1;
    const nuevoAcumuladoPaso2 = acumuladoAnteriorPaso2 + totalDiaPaso2;
    
    // Calcular porcentaje
    let porcentaje = 0;
    if (nuevoAcumuladoPaso1 > 0 && nuevoAcumuladoPaso2 > 0) {
      const menor = Math.min(nuevoAcumuladoPaso1, nuevoAcumuladoPaso2);
      const mayor = Math.max(nuevoAcumuladoPaso1, nuevoAcumuladoPaso2);
      porcentaje = (menor / mayor) * 100;
    }
    
    // Crear objeto con datos CORREGIDOS
    const datosDia = {
      date: currentDate,
      paso1: {
        dato1: todayData.paso1.dato1 || '',
        dato2: todayData.paso1.dato2 || '',
        total: totalDiaPaso1,
        acumuladoAnterior: acumuladoAnteriorPaso1, // ← ¡CORREGIDO!
        acumulado: nuevoAcumuladoPaso1 // ← ¡CORREGIDO!
      },
      paso2: {
        dato1: todayData.paso2.dato1 || '',
        dato2: todayData.paso2.dato2 || '',
        total: totalDiaPaso2,
        acumuladoAnterior: acumuladoAnteriorPaso2, // ← ¡CORREGIDO!
        acumulado: nuevoAcumuladoPaso2 // ← ¡CORREGIDO!
      },
      porcentaje: porcentaje
    };
    
    console.log('💾 Guardando datos CORREGIDOS:', datosDia);
    
    // Actualizar historicalData
    const nuevosHistoricalData = {
      ...historicalData,
      [currentDate]: datosDia
    };
    
    setHistoricalData(nuevosHistoricalData);
    setTodayData(datosDia);
    
    // Guardar en Firebase
    if (user) {
      const exito = await saveToFirebase('historicalData', currentDate, datosDia);
      setCloudStatus(exito ? '💾 Guardado en la nube' : '💾 Guardado localmente');
    }
    
    // Marcar como completado
    setIsDayCompleted(true);
    setCompletedSteps({ paso1: true, paso2: true });
    setCurrentView('resumen');

    alert('✅ Día guardado exitosamente.\n\nLos datos permanecen visibles en modo solo lectura.\nPodrás registrar el siguiente día mañana.');
    
  } catch (error) {
    console.error('Error al guardar datos:', error);
    alert('❌ Error al guardar los datos. Intenta nuevamente.');
  }
};

  // Iniciar edición
  const startEditing = (date) => {
    const dataToEdit = historicalData[date];
    setEditData({ ...dataToEdit });
    setIsEditing(true);
  };

  // Guardar cambios de edición
  const saveEdit = async () => {
    try {
      const newHistoricalData = {
        ...historicalData,
        [editData.date]: { ...editData }
      };
      
      setHistoricalData(newHistoricalData);
      
      // Guardar en Firebase (si hay conexión)
      if (user) {
        await saveToFirebase('historicalData', editData.date, editData);
        setCloudStatus('💾 Cambios guardados en la nube');
      }
      
      // 🆕 Si se editó el día actual, actualizar todayData
      if (editData.date === currentDate) {
        setTodayData(editData);
      }
      
      setSelectedDate(null);
      setIsEditing(false);
      setEditData(null);

      alert('✅ Cambios guardados exitosamente.');
    } catch (error) {
      console.error('Error saving edit:', error);
      alert('❌ Error al guardar los cambios. Intenta nuevamente.');
    }
  };

  // Cancelar edición
  const cancelEdit = () => {
    setIsEditing(false);
    setEditData(null);
  };

  // Ver datos históricos
  const viewHistoricalData = (date) => {
    setSelectedDate(date);
    setShowCalendar(false);
  };

  // Exportar datos a JSON
  const exportData = () => {
    try {
      const exportObj = {
        fechaExportacion: new Date().toISOString(),
        datosDiarios: historicalData,
        resumenesMensuales: monthlyData,
        informacion: {
          totalDiasRegistrados: Object.keys(historicalData).length,
          totalMesesConsolidados: Object.keys(monthlyData).length,
          ultimaActualizacion: new Date().toISOString(),
          usuarioId: user?.uid || 'local'
        }
      };
      
      const dataStr = JSON.stringify(exportObj, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
      
      const exportFileDefaultName = `calculadora-diaria-backup-${currentDate}.json`;
      
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
      
      alert('📥 Datos exportados exitosamente.');
    } catch (error) {
      console.error('Error exporting data:', error);
      alert('❌ Error al exportar los datos.');
    }
  };

  // Importar datos desde JSON - VERSIÓN CORREGIDA
  const importData = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const importedData = JSON.parse(e.target.result);
        
        let newHistoricalData = {};
        let newMonthlyData = {};
        
        if (importedData.datosDiarios) {
          newHistoricalData = importedData.datosDiarios;
          setHistoricalData(newHistoricalData);
          
          // Guardar en Firebase si hay usuario
          if (user) {
            for (const [date, data] of Object.entries(newHistoricalData)) {
              await saveToFirebase('historicalData', date, data);
            }
          }
        }
        
        if (importedData.resumenesMensuales) {
          newMonthlyData = importedData.resumenesMensuales;
          setMonthlyData(newMonthlyData);
          
          // Guardar en Firebase si hay usuario
          if (user) {
            for (const [month, data] of Object.entries(newMonthlyData)) {
              await saveToFirebase('monthlyData', month, data);
            }
          }
        }
        
        // 🆕 CRÍTICO: Después de importar, verificar si el día actual está en los datos importados
        if (newHistoricalData[currentDate]) {
          console.log('✅ Día actual encontrado en datos importados');
          
          // Cargar los datos del día actual
          const todayImportedData = newHistoricalData[currentDate];
          
          // Asegurarse de que todos los campos estén presentes
          const completeDayData = {
            ...todayImportedData,
            paso1: {
              dato1: todayImportedData.paso1.dato1 || '',
              dato2: todayImportedData.paso1.dato2 || '',
              total: todayImportedData.paso1.total || 0,
              acumuladoAnterior: todayImportedData.paso1.acumuladoAnterior || 0,
              acumulado: todayImportedData.paso1.acumulado || 0
            },
            paso2: {
              dato1: todayImportedData.paso2.dato1 || '',
              dato2: todayImportedData.paso2.dato2 || '',
              total: todayImportedData.paso2.total || 0,
              acumuladoAnterior: todayImportedData.paso2.acumuladoAnterior || 0,
              acumulado: todayImportedData.paso2.acumulado || 0
            }
          };
          
          // ACTUALIZAR EL ESTADO todayData CON LOS DATOS IMPORTADOS
          setTodayData(completeDayData);
          
          // Marcar como día completado
          setIsDayCompleted(true);
          
          // Marcar pasos como completados
          setCompletedSteps({ paso1: true, paso2: true });
          
          // Ir a la vista de resumen para mostrar los datos
          setCurrentView('resumen');
          
          // Actualizar cloud status
          setCloudStatus('💾 Datos importados y cargados');
          
          // Mostrar mensaje específico
          alert(`✅ Datos importados exitosamente.\n\nSe encontraron datos para hoy (${currentDate}).\nLos datos del día actual se han cargado en modo solo lectura.`);
        } else {
          console.log('ℹ️ Día actual NO encontrado en datos importados');
          
          // Si no hay datos para hoy, cargar datos del día anterior (si existen)
          if (Object.keys(newHistoricalData).length > 0) {
            // Obtener la fecha más reciente de los datos importados
            const dates = Object.keys(newHistoricalData).sort();
            const lastDate = dates[dates.length - 1];
            
            if (lastDate < currentDate) {
              // Si la última fecha importada es anterior a hoy, cargar acumulados
              const lastData = newHistoricalData[lastDate];
              
              setTodayData(prev => ({
                ...prev,
                date: currentDate,
                paso1: {
                  dato1: '',
                  dato2: '',
                  total: 0,
                  acumuladoAnterior: lastData.paso1.acumulado,
                  acumulado: lastData.paso1.acumulado
                },
                paso2: {
                  dato1: '',
                  dato2: '',
                  total: 0,
                  acumuladoAnterior: lastData.paso2.acumulado,
                  acumulado: lastData.paso2.acumulado
                },
                porcentaje: 0
              }));
              
              alert(`📊 Datos importados exitosamente.\n\nÚltimo día registrado: ${lastDate}\nSe han cargado los acumulados para continuar desde hoy.`);
            }
          }
          
          // Resetear pasos
          setCompletedSteps({ paso1: false, paso2: false });
          setCurrentView('paso1');
          setCloudStatus('💾 Datos importados - Listo para continuar');
        }
        
      } catch (error) {
        console.error('Error importing data:', error);
        setCloudStatus('❌ Error al importar');
        alert('❌ Error al importar los datos. Verifica el formato del archivo.');
      }
    };
    
    reader.readAsText(file);
  };

  // Generar días del mes para el calendario
  const generateCalendarDays = () => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startingDayOfWeek = firstDay.getDay();
    
    const days = [];
    
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    
    for (let day = 1; day <= lastDay.getDate(); day++) {
      const date = new Date(year, month, day);
      const dateString = date.toISOString().split('T')[0];
      const hasData = historicalData.hasOwnProperty(dateString);
      const isToday = dateString === currentDate;
      
      days.push({
        day,
        date: dateString,
        hasData,
        isToday
      });
    }
    
    return days;
  };

  // Cambiar mes del calendario
  const changeMonth = (increment) => {
    setCalendarMonth(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(newDate.getMonth() + increment);
      return newDate;
    });
  };

  // Renderizar historial mensual
  const renderMonthlyHistory = () => {
    const months = Object.entries(monthlyData).sort((a, b) => b[0].localeCompare(a[0]));
    
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">📊 Historial de Meses</h2>
          <div className="flex space-x-2">
       
            <button
              onClick={() => setShowMonthlyHistory(false)}
              className="text-gray-500 hover:text-gray-700 text-2xl"
            >
              ✕
            </button>
          </div>
        </div>
        
        {months.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No hay meses completados aún</p>
        ) : (
          <div className="space-y-6">
            {months.map(([monthKey, data]) => (
              <div key={monthKey} className="border rounded-lg p-4 bg-gradient-to-r from-blue-50 to-purple-50">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-bold text-lg text-purple-900">
                    {new Date(monthKey + '-01').toLocaleDateString('es-CO', { 
                      month: 'long', 
                      year: 'numeric' 
                    })}
                  </h3>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => {
                        // Función para exportar un mes específico
                        const exportObj = {
                          fechaExportacion: new Date().toISOString(),
                          mes: monthKey,
                          datosMensuales: data,
                          informacion: {
                            diasRegistrados: data.informacionConsolidada.diasTotales,
                            totalGeneral: formatCurrency(data.acumuladoGeneral.total),
                            porcentajeFinal: data.porcentajeFinal
                          }
                        };
                        
                        const jsonStr = JSON.stringify(exportObj, null, 2);
                        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(jsonStr);
                        const exportFileName = `mes-${monthKey}-resumen.json`;
                        
                        const linkElement = document.createElement('a');
                        linkElement.setAttribute('href', dataUri);
                        linkElement.setAttribute('download', exportFileName);
                        linkElement.click();
                        
                        alert(`📥 Mes ${monthKey} exportado exitosamente.`);
                      }}
                      className="text-sm bg-purple-100 text-purple-700 px-3 py-1 rounded-full hover:bg-purple-200 transition-colors"
                    >
                      Exportar
                    </button>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                  <div>
                    <p className="text-gray-600">Días registrados:</p>
                    <p className="font-bold text-lg">{data.informacionConsolidada.diasTotales}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Total Paso 1:</p>
                    <p className="font-bold text-blue-900">{formatCurrency(data.totalesPorDia.paso1)}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Total Paso 2:</p>
                    <p className="font-bold text-green-900">{formatCurrency(data.totalesPorDia.paso2)}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Total General:</p>
                    <p className="font-bold text-purple-900 text-lg">{formatCurrency(data.totalesPorDia.general)}</p>
                  </div>
                </div>
                
                <div className="border-t pt-3 mt-3">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">Acumulado Paso 1:</p>
                      <p className="font-bold text-blue-900">{formatCurrency(data.acumuladoGeneral.paso1)}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Acumulado Paso 2:</p>
                      <p className="font-bold text-green-900">{formatCurrency(data.acumuladoGeneral.paso2)}</p>
                    </div>
                  </div>
                  <div className="mt-3 text-center">
                    <p className="text-gray-600">Porcentaje final:</p>
                    <p className="font-bold text-2xl text-purple-900">{data.porcentajeFinal}%</p>
                  </div>
                </div>
                
                <div className="mt-4 text-xs text-gray-500">
                  <p>📅 {new Date(data.fechaConsolidacion).toLocaleDateString('es-CO', { 
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        
        <div className="mt-6 space-y-4">
          {/* ===================== SECCIÓN: EXPORTAR MES ANTERIOR ===================== */}
          <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded-lg">
            <h4 className="font-bold text-yellow-900 mb-2">📤 Exportar Mes Anterior</h4>
            <p className="text-sm text-yellow-800 mb-3">
              Exporta el resumen del mes anterior ({getPreviousMonth()}) como archivo JSON.
              Los datos diarios permanecen en Firebase para historial.
            </p>
            <button
              onClick={exportPreviousMonth}
              className="w-full bg-yellow-500 text-white py-3 rounded-lg font-semibold hover:bg-yellow-600 transition-colors flex items-center justify-center space-x-2"
            >
              <Download size={20} />
              <span>EXPORTAR MES ANTERIOR ({getPreviousMonth()})</span>
            </button>
          </div>
          
          {/* ===================== SECCIÓN MEJORADA: REINICIAR MES ACTUAL ===================== */}
          <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-lg">
            <h4 className="font-bold text-red-900 mb-2">⚠️ Reiniciar mes actual</h4>
            <p className="text-sm text-red-700 mb-2">
              <strong>Esta acción eliminará SOLO los datos del mes actual ({currentMonth}):</strong>
            </p>
            <ul className="text-sm text-red-700 list-disc pl-5 mb-3">
              <li>Días registrados en {currentMonth}</li>
              <li>Acumulados de {currentMonth}</li>
            </ul>
            <p className="text-sm text-red-700 mb-3">
              <strong>NO se eliminarán:</strong>
              <br/>
              • Meses anteriores (quedan en historial)
              <br/>
              • JSONs de meses completados
              <br/>
              • Resúmenes mensuales anteriores
            </p>
            <button
              onClick={resetCurrentMonth}
              className="w-full bg-red-600 text-white py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors flex items-center justify-center space-x-2"
            >
              <Trash2 size={20} />
              <span>REINICIAR MES ACTUAL ({currentMonth})</span>
            </button>
            <p className="text-xs text-red-600 mt-2 text-center">
              ⚠️ Esta acción NO se puede deshacer para el mes actual
            </p>
          </div>
          {/* ===================== FIN SECCIÓN REINICIAR MES ACTUAL ===================== */}
          
          <div className="bg-blue-50 p-4 rounded-lg">
            <h4 className="font-bold text-blue-900 mb-2">📤 Importar/Exportar Datos</h4>
            <div className="flex space-x-4">
              <button
                onClick={exportData}
                className="flex-1 bg-green-500 text-white py-2 rounded-lg font-semibold hover:bg-green-600 transition-colors flex items-center justify-center space-x-2"
              >
                <Download size={18} />
                <span>Exportar Todo</span>
              </button>
              <label className="relative group flex-1 bg-blue-500 text-white py-2 rounded-lg font-semibold hover:bg-blue-600 transition-colors flex items-center justify-center space-x-2 cursor-pointer">
                <span>📥 Importar</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={importData}
                  className="hidden"
                />
                <div className="absolute invisible group-hover:visible bg-gray-800 text-white text-xs rounded py-1 px-2 -bottom-8 left-1/2 transform -translate-x-1/2 whitespace-nowrap z-10">
                  Importa datos exportados previamente
                </div>
              </label>
            </div>
            <p className="text-xs text-gray-600 mt-2 text-center">
              💡 Si importas datos que incluyen el día actual, se cargarán automáticamente
            </p>
          </div>
          
          <div className="text-sm text-gray-500">
            <p>💡 Cada mes se genera automáticamente un JSON consolidado con:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Mes y días registrados</li>
              <li>Totales por día de cada paso</li>
              <li>Acumulado general del mes</li>
              <li>Porcentaje final comparativo</li>
            </ul>
            <p className="mt-3">☁️ {cloudStatus}</p>
          </div>
        </div>
      </div>
    );
  };

  // Renderizar calendario
  const renderCalendar = () => {
    const days = generateCalendarDays();
    const monthName = calendarMonth.toLocaleDateString('es-CO', { 
      month: 'long', 
      year: 'numeric' 
    });
    const weekDays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Historial</h2>
          <button
            onClick={() => setShowCalendar(false)}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ✕
          </button>
        </div>
        
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => changeMonth(-1)}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ChevronLeft size={24} />
          </button>
          <h3 className="text-xl font-semibold capitalize">{monthName}</h3>
          <button
            onClick={() => changeMonth(1)}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ChevronRight size={24} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-2 mb-2">
          {weekDays.map(day => (
            <div key={day} className="text-center font-semibold text-gray-600 text-sm">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2">
          {days.map((dayInfo, index) => {
            if (!dayInfo) {
              return <div key={`empty-${index}`} className="aspect-square"></div>;
            }

            const { day, date, hasData, isToday } = dayInfo;

            return (
              <button
                key={date}
                onClick={() => hasData ? viewHistoricalData(date) : null}
                disabled={!hasData}
                className={`
                  aspect-square p-2 rounded-lg font-semibold transition-all
                  ${hasData 
                    ? 'bg-blue-500 text-white hover:bg-blue-600 cursor-pointer' 
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }
                  ${isToday ? 'ring-2 ring-green-500' : ''}
                `}
              >
                {day}
              </button>
            );
          })}
        </div>

        <div className="mt-4 text-sm text-gray-600 space-y-1">
          <p>• <span className="text-blue-500 font-semibold">Azul</span>: Días con datos guardados</p>
          <p>• <span className="text-gray-400 font-semibold">Gris</span>: Días sin datos</p>
          <p>• <span className="text-green-500 font-semibold">Borde verde</span>: Día actual</p>
        </div>
      </div>
    );
  };

// Renderizar vista histórica
const renderHistoricalView = () => {
  const data = editData || historicalData[selectedDate];
  
  // Calcular acumulado del mes hasta la fecha seleccionada
  const calculateMonthAccumulated = () => {
    const monthKey = selectedDate.slice(0, 7);
    const monthDays = Object.entries(historicalData)
      .filter(([date]) => date.startsWith(monthKey) && date <= selectedDate)
      .sort((a, b) => a[0].localeCompare(b[0]));
    
    if (monthDays.length === 0) return { paso1: 0, paso2: 0, total: 0, porcentaje: 0 };
    
    const lastDay = monthDays[monthDays.length - 1][1];
    const acum1 = lastDay.paso1.acumulado;
    const acum2 = lastDay.paso2.acumulado;
    const total = acum1 + acum2;
    
    // Calcular porcentaje del mes: menor acumulado sobre mayor acumulado
    let porcentaje = 0;
    if (acum1 > 0 && acum2 > 0) {
      const menor = Math.min(acum1, acum2);
      const mayor = Math.max(acum1, acum2);
      porcentaje = (menor / mayor) * 100;
    }
    
    return { paso1: acum1, paso2: acum2, total, porcentaje };
  };
  
  // Calcular porcentaje del día
  const calculateDayPercentage = () => {
    const totalPaso1 = data.paso1.total || 0;
    const totalPaso2 = data.paso2.total || 0;
    
    let porcentajeDia = 0;
    if (totalPaso1 > 0 && totalPaso2 > 0) {
      const menor = Math.min(totalPaso1, totalPaso2);
      const mayor = Math.max(totalPaso1, totalPaso2);
      porcentajeDia = (menor / mayor) * 100;
    }
    
    return porcentajeDia;
  };
  
  const monthAccumulated = calculateMonthAccumulated();
  const dayPercentage = calculateDayPercentage();
  
  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800">
          {new Date(selectedDate + 'T00:00:00').toLocaleDateString('es-CO', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          })}
        </h2>
        <button
          onClick={() => {
            setSelectedDate(null);
            setIsEditing(false);
            setEditData(null);
          }}
          className="text-gray-500 hover:text-gray-700 text-2xl"
        >
          ✕
        </button>
      </div>

      <div className="space-y-6">

        {/* Sección de Porcentajes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Porcentaje del DÍA */}
          <div className="border rounded-lg p-4 bg-amber-50 border-amber-200">
            <h3 className="font-bold text-lg mb-3 text-amber-900">Porcentaje del DÍA</h3>
            <div className="space-y-2 text-amber-600">
              <p className="font-bold text-3xl text-center text-amber-700">
                {dayPercentage.toFixed(2)}%
              </p>
            </div>
          </div>

          {/* Porcentaje del MES */}
          <div className="border rounded-lg p-4 bg-purple-50 border-purple-200">
            <h3 className="font-bold text-lg mb-3 text-purple-900">Porcentaje del MES</h3>
            <div className="space-y-2 text-purple-900">
              <p className="font-bold text-3xl text-center text-purple-700">
                {monthAccumulated.porcentaje.toFixed(2)}%
              </p>
            </div>
          </div>
        </div>

         {/* Pasos 1 y 2 lado a lado */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Paso 1 */}
          <div className="border rounded-lg p-4 bg-blue-50">
            <h3 className="font-bold text-lg mb-3 text-blue-900">Paso 1</h3>
            {isEditing ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-gray-700 font-semibold mb-1 text-sm">Dato 1</label>
                  <input
                    type="text"
                    value={formatCurrency(data.paso1.dato1)}
                    onChange={(e) => handleEditInputChange('paso1', 'dato1', e.target.value)}
                    className="w-full p-2 border-2 border-blue-300 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-semibold mb-1 text-sm">Dato 2</label>
                  <input
                    type="text"
                    value={formatCurrency(data.paso1.dato2)}
                    onChange={(e) => handleEditInputChange('paso1', 'dato2', e.target.value)}
                    className="w-full p-2 border-2 border-blue-300 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div className="pt-2 border-t border-blue-200">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-xs text-gray-600">Acum. anterior:</p>
                      <p className="font-bold text-blue-900">{formatCurrency(data.paso1.acumuladoAnterior)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Total del día:</p>
                      <p className="font-bold text-blue-900">{formatCurrency(data.paso1.total)}</p>
                    </div>
                  </div>
                  <div className="mt-2">
                    <p className="text-xs text-gray-600">Acumulado del mes:</p>
                    <p className="font-bold text-lg text-blue-900">{formatCurrency(data.paso1.acumulado)}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="pt-2 border-t border-blue-200">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-xs text-gray-600">Total del día:</p>
                      <p className="font-bold text-blue-900">{formatCurrency(data.paso1.total)}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Paso 2 */}
          <div className="border rounded-lg p-4 bg-green-50">
            <h3 className="font-bold text-lg mb-3 text-green-900">Paso 2</h3>
            {isEditing ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-gray-700 font-semibold mb-1 text-sm">Dato 1</label>
                  <input
                    type="text"
                    value={formatCurrency(data.paso2.dato1)}
                    onChange={(e) => handleEditInputChange('paso2', 'dato1', e.target.value)}
                    className="w-full p-2 border-2 border-green-300 rounded-lg focus:border-green-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-semibold mb-1 text-sm">Dato 2</label>
                  <input
                    type="text"
                    value={formatCurrency(data.paso2.dato2)}
                    onChange={(e) => handleEditInputChange('paso2', 'dato2', e.target.value)}
                    className="w-full p-2 border-2 border-green-300 rounded-lg focus:border-green-500 focus:outline-none"
                  />
                </div>
                <div className="pt-2 border-t border-green-200">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-xs text-gray-600">Acum. anterior:</p>
                      <p className="font-bold text-green-900">{formatCurrency(data.paso2.acumuladoAnterior)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Total del día:</p>
                      <p className="font-bold text-green-900">{formatCurrency(data.paso2.total)}</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="pt-2 border-t border-green-200">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-xs text-gray-600">Total del día:</p>
                      <p className="font-bold text-green-900">{formatCurrency(data.paso2.total)}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Resumen comparativo */}
        <div className="border rounded-lg p-4 bg-gray-50">
          <h3 className="font-bold text-lg mb-3 text-gray-900">Resumen Comparativo</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-blue-50 p-3 rounded-lg">
              <p className="text-sm text-gray-600">Paso 1 - Total del día:</p>
              <p className="font-bold text-lg text-blue-900">{formatCurrency(data.paso1.total)}</p>
              <p className="text-sm text-gray-600 mt-2">Paso 1 - Acum. del mes:</p>
              <p className="font-bold text-xl text-blue-900">{formatCurrency(data.paso1.acumulado)}</p>
            </div>
            <div className="bg-green-50 p-3 rounded-lg">
              <p className="text-sm text-gray-600">Paso 2 - Total del día:</p>
              <p className="font-bold text-lg text-green-900">{formatCurrency(data.paso2.total)}</p>
              <p className="text-sm text-gray-600 mt-2">Paso 2 - Acum. del mes:</p>
              <p className="font-bold text-xl text-green-900">{formatCurrency(data.paso2.acumulado)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Botones de acción */}
      <div className="mt-6 space-y-3">
        {isEditing ? (
          <div className="flex space-x-3">
            <button
              onClick={saveEdit}
              className="flex-1 bg-green-500 text-white py-3 rounded-lg font-semibold hover:bg-green-600 transition-colors flex items-center justify-center space-x-2"
            >
              <Check size={20} />
              <span>Guardar Cambios</span>
            </button>
            <button
              onClick={cancelEdit}
              className="flex-1 bg-gray-500 text-white py-3 rounded-lg font-semibold hover:bg-gray-600 transition-colors flex items-center justify-center space-x-2"
            >
              <X size={20} />
              <span>Cancelar</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <button
              onClick={() => startEditing(selectedDate)}
              className="w-full bg-orange-500 text-white py-3 rounded-lg font-semibold hover:bg-orange-600 transition-colors flex items-center justify-center space-x-2"
            >
              <Edit2 size={20} />
              <span>Editar Datos</span>
            </button>
            <button
              onClick={() => {
                setSelectedDate(null);
                setEditData(null);
                setShowCalendar(true);
              }}
              className="w-full bg-gray-500 text-white py-3 rounded-lg font-semibold hover:bg-gray-600 transition-colors"
            >
              Volver al Calendario
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando datos...</p>
          <p className="text-sm text-gray-500 mt-2">Verificando si hoy ya fue registrado</p>
        </div>
      </div>
    );
  }

  if (showMonthlyHistory) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-100 to-purple-100 p-4">
        <div className="max-w-2xl mx-auto">
          {renderMonthlyHistory()}
        </div>
      </div>
    );
  }

  if (showCalendar) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-100 to-purple-100 p-4">
        <div className="max-w-2xl mx-auto">
          {renderCalendar()}
        </div>
      </div>
    );
  }

  if (selectedDate) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-100 to-purple-100 p-4">
        <div className="max-w-2xl mx-auto">
          {renderHistoricalView()}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 to-purple-100 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-4">
          <div className="flex justify-between items-center">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-800">Calculadora Diaria</h1>
              <p className="text-gray-600">
                {new Date(currentDate + 'T00:00:00').toLocaleDateString('es-CO', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
              {/* 🆕 Mostrar información del mes */}
              <div className="mt-2 flex flex-wrap gap-2">
                {isDayCompleted && (
                  <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm inline-flex items-center">
                    ✅ Día completado - Datos guardados
                  </span>
                )}
                <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm">
                  📅 Mes: {currentMonth}
                </span>
                {isLastDayOfMonth && (
                  <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm font-semibold">
                    ⚠️ ¡ÚLTIMO DÍA DEL MES!
                  </span>
                )}
              </div>
              <div className="mt-2 flex space-x-2">
                <span className={`text-sm px-3 py-1 rounded-full flex items-center ${
                  cloudStatus.includes('✅') ? 'bg-green-100 text-green-700' :
                  cloudStatus.includes('💾') ? 'bg-blue-100 text-blue-700' :
                  cloudStatus.includes('⚠️') ? 'bg-yellow-100 text-yellow-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  <Cloud size={12} className="mr-1" />
                  {cloudStatus}
                </span>
                <button
                  onClick={exportData}
                  className="text-sm bg-green-100 text-green-700 px-3 py-1 rounded-full hover:bg-green-200 transition-colors flex items-center space-x-1"
                >
                  <Download size={12} />
                  <span>Exportar Datos</span>
                </button>
              </div>
            </div>
            <button
              onClick={() => setShowCalendar(true)}
              className="bg-blue-500 text-white p-3 rounded-lg hover:bg-blue-600 transition-colors"
              title="Ver historial diario"
            >
              <Calendar size={24} />
            </button>
            <button
              onClick={() => setShowMonthlyHistory(true)}
              className="bg-purple-500 text-white p-3 rounded-lg hover:bg-purple-600 transition-colors ml-2"
              title="Ver historial de meses"
            >
              📊
            </button>
          </div>
        </div>

        {/* 🆕 Mensaje de último día del mes */}
        {isLastDayOfMonth && !isDayCompleted && (
          <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 mb-4 rounded-lg">
            <div className="flex">
              <div className="flex-shrink-0">
                <span className="text-yellow-500 text-2xl">⚠️</span>
              </div>
              <div className="ml-3">
                <h3 className="text-lg font-bold text-yellow-800">¡ÚLTIMO DÍA DEL MES!</h3>
                <div className="mt-1 text-yellow-700">
                  <p className="font-semibold">📝 Puedes registrar datos normalmente hoy.</p>
                  <ul className="mt-1 text-sm list-disc list-inside space-y-1">
                    <li>Mañana comenzará un nuevo mes automáticamente</li>
                    <li>Los acumulados se reiniciarán a CERO</li>
                    <li>Los datos de este mes permanecerán en Firebase</li>
                    <li>Podrás exportar el resumen del mes desde el historial</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Navegación */}
        <div className="bg-white rounded-lg shadow-lg p-4 mb-4">
          <div className="flex space-x-2">
            <button
              onClick={() => setCurrentView('paso1')}
              disabled={!isDayCompleted && (currentView === 'paso2' || currentView === 'paso1')}
              className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-colors ${
                currentView === 'paso1'
                  ? 'bg-blue-500 text-white'
                  : completedSteps.paso2 || isDayCompleted
                  ? 'bg-gray-200 text-gray-700 hover:bg-gray-300 cursor-pointer'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              Paso 1
            </button>
            <button
              onClick={() => setCurrentView('paso2')}
              disabled={!isDayCompleted && (currentView === 'paso2' || !completedSteps.paso1)}
              className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-colors ${
                currentView === 'paso2'
                  ? 'bg-green-500 text-white'
                  : completedSteps.paso2 || isDayCompleted
                  ? 'bg-gray-200 text-gray-700 hover:bg-gray-300 cursor-pointer'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              Paso 2
            </button>
            <button
              onClick={() => setCurrentView('resumen')}
              disabled={!completedSteps.paso2 && !isDayCompleted}
              className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-colors ${
                currentView === 'resumen'
                  ? 'bg-purple-500 text-white'
                  : completedSteps.paso2 || isDayCompleted
                  ? 'bg-gray-200 text-gray-700 hover:bg-gray-300 cursor-pointer'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              Resumen
            </button>
          </div>
        </div>

        {/* Contenido */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          {currentView === 'paso1' && (
  <div>
    <h2 className="text-2xl font-bold text-blue-900 mb-6">Paso 1</h2>
    
    {/* 🆕 Mensaje si el día ya está completado */}
    {isDayCompleted && (
      <div className="bg-blue-100 border-l-4 border-blue-500 p-4 mb-4">
        <p className="text-blue-800 font-semibold">
          ℹ️ Este día ya fue registrado. Los datos están en modo solo lectura.
        </p>
        <p className="text-sm text-blue-700 mt-1">
          Podrás registrar nuevos datos mañana o editar este día desde el historial.
        </p>
      </div>
    )}
    
    {todayData.paso2.acumuladoAnterior > 0 && !isDayCompleted && (
      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 mb-4">
        <p className="text-sm text-yellow-800">
          📊 <strong>Total del dia anterior: {formatCurrency(todayData.paso2.acumuladoAnterior)}</strong>
        </p>
      </div>
    )}
    
    <div className="space-y-4">
      {/* SIEMPRE mostrar datos REALES - usar historicalData cuando isDayCompleted = true */}
            {isDayCompleted ? (
              <div className="space-y-3">
                <div className="bg-white p-4 rounded-lg border border-blue-200">
                  <p className="text-gray-700 font-semibold mb-1">Dato 1:</p>
                  <p className="text-2xl font-bold text-blue-900">
                    {formatCurrency(historicalData[currentDate]?.paso1?.dato1 || todayData.paso1.dato1 || '0')}
                  </p>
                </div>
                
                <div className="bg-white p-4 rounded-lg border border-blue-200">
                  <p className="text-gray-700 font-semibold mb-1">Dato 2:</p>
                  <p className="text-2xl font-bold text-blue-900">
                    {formatCurrency(historicalData[currentDate]?.paso1?.dato2 || todayData.paso1.dato2 || '0')}
                  </p>
                </div>
                
                <div className="bg-blue-50 p-4 rounded-lg space-y-1">
                  <p className="text-gray-700 font-semibold">Acumulado anterior: {formatCurrency(historicalData[currentDate]?.paso1?.acumuladoAnterior || todayData.paso1.acumuladoAnterior || 0)}</p>
                  <p className="text-gray-700 font-semibold">Total del día: {formatCurrency(historicalData[currentDate]?.paso1?.total || todayData.paso1.total || 0)}</p>

                </div>
              </div>
            ) : (
              /* MOSTRAR INPUTS NORMALES CUANDO NO ESTÁ COMPLETADO */
              <>
                <div>
                  <label className="block text-gray-700 font-semibold mb-2">Dato 1</label>
                  <input
                    type="text"
                    value={formatCurrency(todayData.paso1.dato1)}
                    onChange={(e) => handleInputChange('paso1', 'dato1', e.target.value)}
                    disabled={completedSteps.paso1}
                    className={`w-full p-3 border-2 rounded-lg text-lg ${
                      completedSteps.paso1
                        ? 'border-gray-300 bg-gray-100 text-gray-600 cursor-not-allowed'
                        : 'border-blue-300 focus:border-blue-500 focus:outline-none'
                    }`}
                    placeholder="$0"
                  />
                </div>

                <div>
                  <label className="block text-gray-700 font-semibold mb-2">Dato 2</label>
                  <input
                    type="text"
                    value={formatCurrency(todayData.paso1.dato2)}
                    onChange={(e) => handleInputChange('paso1', 'dato2', e.target.value)}
                    disabled={completedSteps.paso1}
                    className={`w-full p-3 border-2 rounded-lg text-lg ${
                      completedSteps.paso1
                        ? 'border-gray-300 bg-gray-100 text-gray-600 cursor-not-allowed'
                        : 'border-blue-300 focus:border-blue-500 focus:outline-none'
                    }`}
                    placeholder="$0"
                  />
                </div>

                <div className="bg-blue-50 p-4 rounded-lg space-y-1">
                  <p className="text-gray-700 font-semibold">Total del día: {formatCurrency(todayData.paso1.total)}</p>
                  <p className="text-blue-900 font-bold text-xl mt-2 pt-2 border-t border-blue-200">
                    Acumulado del mes: {formatCurrency(todayData.paso1.acumulado)}
                  </p>
                </div>
              </>
            )}

            {!completedSteps.paso1 && !isDayCompleted && (
              <button
                onClick={continuarPaso1}
                disabled={todayData.paso1.dato1 === '' || todayData.paso1.dato2 === ''}
                className={`w-full py-3 rounded-lg font-semibold transition-colors flex items-center justify-center space-x-2 ${
                  todayData.paso1.dato1 === '' || todayData.paso1.dato2 === ''
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-500 text-white hover:bg-blue-600'
                }`}
              >
                <span>Siguiente: Paso 2</span>
                <ChevronRight size={20} />
              </button>
            )}
            
            {(completedSteps.paso1 || isDayCompleted) && (
              <div className="bg-blue-100 p-3 rounded-lg text-center text-blue-800 font-semibold">
                ✓ Paso completado - Solo lectura
              </div>
            )}
          </div>
        </div>
      )}

          {currentView === 'paso2' && (
  <div>
    <h2 className="text-2xl font-bold text-green-900 mb-6">Paso 2</h2>

    {/* 🆕 Mensaje si el día ya está completado */}
    {isDayCompleted && (
      <div className="bg-green-100 border-l-4 border-green-500 p-4 mb-4">
        <p className="text-green-800 font-semibold">
          ℹ️ Este día ya fue registrado. Los datos están en modo solo lectura.
        </p>
        <p className="text-sm text-green-700 mt-1">
          Podrás registrar nuevos datos mañana o editar este día desde el historial.
        </p>
      </div>
    )}

    {todayData.paso2.acumuladoAnterior > 0 && !isDayCompleted && (
      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 mb-4">
        <p className="text-sm text-yellow-800">
          📊 <strong>Total del dia anterior: {formatCurrency(todayData.paso1.acumuladoAnterior)}</strong>
        </p>
      </div>
    )}

    <div className="space-y-4">
      {/* SIEMPRE mostrar datos REALES - usar historicalData cuando isDayCompleted = true */}
      {isDayCompleted ? (
        <div className="space-y-3">
          <div className="bg-white p-4 rounded-lg border border-green-200">
            <p className="text-gray-700 font-semibold mb-1">Dato 1:</p>
            <p className="text-2xl font-bold text-green-900">
              {formatCurrency(historicalData[currentDate]?.paso2?.dato1 || todayData.paso2.dato1 || '0')}
            </p>
          </div>
          
          <div className="bg-white p-4 rounded-lg border border-green-200">
            <p className="text-gray-700 font-semibold mb-1">Dato 2:</p>
            <p className="text-2xl font-bold text-green-900">
              {formatCurrency(historicalData[currentDate]?.paso2?.dato2 || todayData.paso2.dato2 || '0')}
            </p>
          </div>
          
          <div className="bg-green-50 p-4 rounded-lg space-y-1">
            <p className="text-gray-700 font-semibold">Acumulado anterior: {formatCurrency(historicalData[currentDate]?.paso2?.acumuladoAnterior || todayData.paso2.acumuladoAnterior || 0)}</p>
            <p className="text-gray-700 font-semibold">Total del día: {formatCurrency(historicalData[currentDate]?.paso2?.total || todayData.paso2.total || 0)}</p>
            <p className="text-green-900 font-bold text-xl mt-2 pt-2 border-t border-green-200">
              Acumulado del mes: {formatCurrency(historicalData[currentDate]?.paso2?.acumulado || todayData.paso2.acumulado || 0)}
            </p>
          </div>
        </div>
      ) : (
        /* MOSTRAR INPUTS NORMALES CUANDO NO ESTÁ COMPLETADO */
        <>
          <div>
            <label className="block text-gray-700 font-semibold mb-2">Dato 1</label>
            <input
              type="text"
              value={formatCurrency(todayData.paso2.dato1)}
              onChange={(e) => handleInputChange('paso2', 'dato1', e.target.value)}
              disabled={completedSteps.paso2}
              className={`w-full p-3 border-2 rounded-lg text-lg ${
                completedSteps.paso2
                  ? 'border-gray-300 bg-gray-100 text-gray-600 cursor-not-allowed'
                  : 'border-green-300 focus:border-green-500 focus:outline-none'
              }`}
              placeholder="$0"
            />
          </div>

          <div>
            <label className="block text-gray-700 font-semibold mb-2">Dato 2</label>
            <input
              type="text"
              value={formatCurrency(todayData.paso2.dato2)}
              onChange={(e) => handleInputChange('paso2', 'dato2', e.target.value)}
              disabled={completedSteps.paso2}
              className={`w-full p-3 border-2 rounded-lg text-lg ${
                completedSteps.paso2
                  ? 'border-gray-300 bg-gray-100 text-gray-600 cursor-not-allowed'
                  : 'border-green-300 focus:border-green-500 focus:outline-none'
              }`}
              placeholder="$0"
            />
          </div>

          <div className="bg-green-50 p-4 rounded-lg space-y-1">
            <p className="text-gray-700 font-semibold">Total del día: {formatCurrency(todayData.paso2.total)}</p>
            <p className="text-green-900 font-bold text-xl mt-2 pt-2 border-t border-green-200">
              Acumulado del mes: {formatCurrency(todayData.paso2.acumulado)}
            </p>
          </div>
        </>
      )}

      {!completedSteps.paso2 && !isDayCompleted && (
        <button
          onClick={continuarPaso2}
          disabled={todayData.paso2.dato1 === '' || todayData.paso2.dato2 === ''}
          className={`w-full py-3 rounded-lg font-semibold transition-colors flex items-center justify-center space-x-2 ${
            todayData.paso2.dato1 === '' || todayData.paso2.dato2 === ''
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-green-500 text-white hover:bg-green-600'
          }`}
        >
          <span>Ver Resumen</span>
          <ChevronRight size={20} />
        </button>
      )}
      
      {(completedSteps.paso2 || isDayCompleted) && (
        <div className="bg-green-100 p-3 rounded-lg text-center text-green-800 font-semibold">
          ✓ Paso completado - Solo lectura
        </div>
      )}
    </div>
  </div>
)}
          {currentView === 'resumen' && (
  <div>
    <h2 className="text-2xl font-bold text-purple-900 mb-6">Resumen del Día</h2>
    
    {/* 🆕 Mensaje si el día ya está completado */}
    {isDayCompleted && (
      <div className="bg-purple-100 border-l-4 border-purple-500 p-4 mb-4">
        <p className="text-purple-800 font-semibold">
          ✅ Este día ya fue guardado exitosamente.
        </p>
        <p className="text-sm text-purple-700 mt-1">
          Los datos están sincronizados con la nube. Podrás registrar el siguiente día mañana.
        </p>
      </div>
    )}
    
    <div className="space-y-4">
      <div className="bg-blue-50 p-4 rounded-lg">
        <h3 className="font-bold text-blue-900 mb-3 text-lg">Paso 1</h3>
        <p className="text-gray-700">
          Total del día: <span className="font-bold">
            {formatCurrency(
              isDayCompleted && historicalData[currentDate] 
                ? historicalData[currentDate].paso1.total 
                : todayData.paso1.total || 0
            )}
          </span>
        </p>
        <p className="text-blue-900 font-bold text-xl mt-2 pt-2 border-t border-blue-200">
          Acumulado del mes: {formatCurrency(
            isDayCompleted && historicalData[currentDate] 
              ? historicalData[currentDate].paso1.acumulado 
              : todayData.paso1.acumulado || 0
          )}
        </p>
      </div>

      <div className="bg-green-50 p-4 rounded-lg">
        <h3 className="font-bold text-green-900 mb-3 text-lg">Paso 2</h3>
        <p className="text-gray-700">
          Total del día: <span className="font-bold">
            {formatCurrency(
              isDayCompleted && historicalData[currentDate] 
                ? historicalData[currentDate].paso2.total 
                : todayData.paso2.total || 0
            )}
          </span>
        </p>
        <p className="text-green-900 font-bold text-xl mt-2 pt-2 border-t border-green-200">
          Acumulado del mes: {formatCurrency(
            isDayCompleted && historicalData[currentDate] 
              ? historicalData[currentDate].paso2.acumulado 
              : todayData.paso2.acumulado || 0
          )}
        </p>
      </div>

      {/* 🆕 Total del día (suma de ambos pasos del día) */}
      <div className="bg-purple-50 p-4 rounded-lg border-2 border-purple-200">
        <h3 className="font-bold text-purple-900 text-lg mb-3">Total del Día</h3>
        <p className="font-bold text-3xl text-purple-900">
          {formatCurrency(
            (isDayCompleted && historicalData[currentDate] 
              ? (historicalData[currentDate].paso1.total || 0) + (historicalData[currentDate].paso2.total || 0)
              : (todayData.paso1.total || 0) + (todayData.paso2.total || 0)
            )
          )}
        </p>
        <div className="border-t-2 border-purple-300 pt-3 mt-3">
          <p className="font-bold text-purple-900 text-2xl">
            Porcentaje: {(
              isDayCompleted && historicalData[currentDate] 
                ? historicalData[currentDate].porcentaje 
                : todayData.porcentaje || 0
            ).toFixed(2)}%
          </p>
        </div>
      </div>

      {!isDayCompleted && (
        <button
          onClick={saveData}
          className="w-full bg-purple-500 text-white py-3 rounded-lg font-semibold hover:bg-purple-600 transition-colors flex items-center justify-center space-x-2"
        >
          <Save size={20} />
          <span>Guardar Datos del Día</span>
        </button>
      )}
    </div>
  </div>
)}
        </div>

        {/* Footer */}
        <div className="mt-4 text-center text-sm text-gray-500">
          <p>💡 Cada nuevo mes los acumulados comienzan desde CERO. Los meses anteriores permanecen en Firebase para historial.</p>
          <p className="mt-1">☁️ {cloudStatus}</p>
        </div>
      </div>
    </div>
  );
};

export default App;