import React, { useState, useEffect } from 'react';
import { Calendar, Save, ChevronRight, ChevronLeft, Edit2, X, Check, Download, Cloud } from 'lucide-react';
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

  // Detectar cambio de mes y resetear
  useEffect(() => {
    const checkMonthChange = () => {
      const currentMonth = currentDate.slice(0, 7); // "2025-01"
      const savedMonth = localStorage.getItem('currentMonth');
      
      if (savedMonth && savedMonth !== currentMonth) {
        // ¡Cambió el mes! Guardar resumen y resetear
        saveMonthSummary(savedMonth);
      }
      
      localStorage.setItem('currentMonth', currentMonth);
    };
    
    checkMonthChange();
  }, [currentDate]);

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
          
          // 3. 🆕 Verificar si el día actual ya está guardado (después de cargar datos)
          await checkIfTodayIsCompleted();
          
        } catch (firebaseError) {
          console.log('Firebase no disponible, usando modo local');
          setCloudStatus('⚠️ Usando modo local');
          loadDataFromLocalStorage();
          
          // Verificar día actual en modo local
          const localHistorical = JSON.parse(localStorage.getItem('historicalData') || '{}');
          if (localHistorical[currentDate]) {
            setIsDayCompleted(true);
            setTodayData(localHistorical[currentDate]);
            setCompletedSteps({ paso1: true, paso2: true });
            setCurrentView('resumen');
          }
        }
        
        setLoading(false);
      } catch (err) {
        setError('Error al cargar los datos');
        console.error('Error loading data:', err);
        setLoading(false);
      }
    };
    
    loadInitialData();
  }, [currentDate]);

  // 🆕 Función para verificar si el día actual ya fue guardado
  const checkIfTodayIsCompleted = async () => {
    try {
      // Primero verificar en historicalData (que ya se cargó)
      if (historicalData[currentDate]) {
        console.log('✅ Día actual encontrado en historicalData');
        setIsDayCompleted(true);
        setTodayData(historicalData[currentDate]);
        setCompletedSteps({ paso1: true, paso2: true });
        setCurrentView('resumen');
        return true;
      }

      // Si no está en memoria, verificar en Firebase
      if (user) {
        const docRef = doc(db, 'users', user.uid, 'historicalData', currentDate);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          console.log('✅ Día actual encontrado en Firebase');
          const data = docSnap.data();
          setIsDayCompleted(true);
          setTodayData(data);
          setCompletedSteps({ paso1: true, paso2: true });
          setCurrentView('resumen');
          
          // Actualizar historicalData en memoria
          setHistoricalData(prev => ({
            ...prev,
            [currentDate]: data
          }));
          return true;
        } else {
          console.log('ℹ️ Día actual NO encontrado - listo para registrar');
          setIsDayCompleted(false);
          return false;
        }
      }
      return false;
    } catch (error) {
      console.error('Error verificando día actual:', error);
      setIsDayCompleted(false);
      return false;
    }
  };

  // 🆕 Efecto para cargar día anterior después de verificar el día actual
  useEffect(() => {
    if (!loading && !isDayCompleted && Object.keys(historicalData).length >= 0) {
      loadPreviousDayData();
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
      
      // Guardar también en localStorage como backup
      localStorage.setItem('historicalData', JSON.stringify(historical));
      localStorage.setItem('monthlyData', JSON.stringify(monthly));
      
      console.log('✅ Datos cargados desde Firebase:', {
        diasHistoricos: Object.keys(historical).length,
        mesesConsolidados: Object.keys(monthly).length
      });
      
    } catch (error) {
      console.error('Error cargando de Firebase:', error);
      throw error;
    }
  };

  // Función para cargar datos desde localStorage
  const loadDataFromLocalStorage = () => {
    try {
      const savedHistorical = JSON.parse(localStorage.getItem('historicalData') || '{}');
      setHistoricalData(savedHistorical);
      
      const savedMonths = JSON.parse(localStorage.getItem('monthlyData') || '{}');
      setMonthlyData(savedMonths);
    } catch (err) {
      console.error('Error cargando localStorage:', err);
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
      
      // Guardar en localStorage
      const savedMonths = JSON.parse(localStorage.getItem('monthlyData') || '{}');
      savedMonths[monthKey] = summary;
      localStorage.setItem('monthlyData', JSON.stringify(savedMonths));
      
      // Eliminar días del mes de Firebase
      if (user) {
        for (const [date] of monthDays) {
          await deleteFromFirebase('historicalData', date);
        }
      }
      
      // Limpiar datos del mes anterior del estado
      const newHistorical = {};
      Object.entries(historicalData).forEach(([date, data]) => {
        if (!date.startsWith(monthKey)) {
          newHistorical[date] = data;
        }
      });
      setHistoricalData(newHistorical);
      
      // Limpiar también del localStorage
      localStorage.setItem('historicalData', JSON.stringify(newHistorical));
      
      // Mostrar notificación
      alert(`📅 ¡Mes ${monthKey} consolidado!\nSe han registrado ${summary.informacionConsolidada.diasTotales} días.\nEl JSON consolidado está disponible en el historial.`);
      
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

  // Cargar datos del día anterior
  const loadPreviousDayData = () => {
    try {
      const yesterday = getPreviousDay(currentDate);

      if (historicalData[yesterday]) {
        const prevData = historicalData[yesterday];

        setTodayData(prev => ({
          ...prev,
          date: currentDate,
          paso1: {
            dato1: '',
            dato2: '',
            total: 0,
            acumuladoAnterior: prevData.paso1.acumulado,
            acumulado: prevData.paso1.acumulado
          },
          paso2: {
            dato1: '',
            dato2: '',
            total: 0,
            acumuladoAnterior: prevData.paso2.acumulado,
            acumulado: prevData.paso2.acumulado
          },
          porcentaje: 0
        }));
      } else {
        // No hay día anterior, empezar desde cero
        setTodayData(prev => ({
          ...prev,
          date: currentDate,
          paso1: { dato1: '', dato2: '', total: 0, acumuladoAnterior: 0, acumulado: 0 },
          paso2: { dato1: '', dato2: '', total: 0, acumuladoAnterior: 0, acumulado: 0 },
          porcentaje: 0
        }));
      }

      setCompletedSteps({ paso1: false, paso2: false });
      setCurrentView('paso1');
    } catch (error) {
      console.error('Error loading previous day data:', error);
    }
  };

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

  // Guardar datos del día
  const saveData = async () => {
    try {
      const newHistoricalData = {
        ...historicalData,
        [todayData.date]: { ...todayData }
      };
      
      setHistoricalData(newHistoricalData);
      
      // Guardar en localStorage
      localStorage.setItem('historicalData', JSON.stringify(newHistoricalData));
      
      // Guardar en Firebase (si hay conexión)
      if (user) {
        const firebaseSuccess = await saveToFirebase('historicalData', todayData.date, todayData);
        if (firebaseSuccess) {
          setCloudStatus('💾 Guardado en la nube');
        } else {
          setCloudStatus('💾 Guardado localmente');
        }
      }
      
      // 🆕 Marcar el día como completado
      setIsDayCompleted(true);
      
      // 🆕 Mantener los datos visibles (NO resetear todayData)
      // Los datos permanecen en todayData para ser mostrados en modo solo lectura
      setCompletedSteps({ paso1: true, paso2: true });
      setCurrentView('resumen');

      alert('✅ Día guardado exitosamente.\n\nLos datos permanecen visibles en modo solo lectura.\nPodrás registrar el siguiente día mañana.');
    } catch (error) {
      console.error('Error saving day data:', error);
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
      
      // Guardar en localStorage
      localStorage.setItem('historicalData', JSON.stringify(newHistoricalData));
      
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

  // Importar datos desde JSON
  const importData = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const importedData = JSON.parse(e.target.result);
        
        if (importedData.datosDiarios) {
          setHistoricalData(importedData.datosDiarios);
          localStorage.setItem('historicalData', JSON.stringify(importedData.datosDiarios));
          
          // Guardar en Firebase si hay usuario
          if (user) {
            for (const [date, data] of Object.entries(importedData.datosDiarios)) {
              await saveToFirebase('historicalData', date, data);
            }
          }
        }
        
        if (importedData.resumenesMensuales) {
          setMonthlyData(importedData.resumenesMensuales);
          localStorage.setItem('monthlyData', JSON.stringify(importedData.resumenesMensuales));
          
          // Guardar en Firebase si hay usuario
          if (user) {
            for (const [month, data] of Object.entries(importedData.resumenesMensuales)) {
              await saveToFirebase('monthlyData', month, data);
            }
          }
        }
        
        alert('📤 Datos importados exitosamente.');
        await checkIfTodayIsCompleted();
        if (!isDayCompleted) {
          loadPreviousDayData();
        }
      } catch (error) {
        console.error('Error importing data:', error);
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
              onClick={exportData}
              className="bg-green-500 text-white p-2 rounded-lg hover:bg-green-600 transition-colors"
              title="Exportar todos los datos"
            >
              <Download size={20} />
            </button>
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
                  <button
                    onClick={() => {
                      const jsonStr = JSON.stringify(data, null, 2);
                      navigator.clipboard.writeText(jsonStr);
                      alert(`JSON del mes ${monthKey} copiado al portapapeles`);
                    }}
                    className="text-sm bg-purple-100 text-purple-700 px-3 py-1 rounded-full hover:bg-purple-200 transition-colors"
                  >
                    Copiar JSON
                  </button>
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
              <label className="flex-1 bg-blue-500 text-white py-2 rounded-lg font-semibold hover:bg-blue-600 transition-colors flex items-center justify-center space-x-2 cursor-pointer">
                <span>📥 Importar</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={importData}
                  className="hidden"
                />
              </label>
            </div>
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
    
    // 🆕 Calcular acumulado del mes hasta la fecha seleccionada
    const calculateMonthAccumulated = () => {
      const monthKey = selectedDate.slice(0, 7);
      const monthDays = Object.entries(historicalData)
        .filter(([date]) => date.startsWith(monthKey) && date <= selectedDate)
        .sort((a, b) => a[0].localeCompare(b[0]));
      
      if (monthDays.length === 0) return { paso1: 0, paso2: 0, total: 0, porcentaje: 0 };
      
      // El acumulado es el del último día hasta la fecha seleccionada
      const lastDay = monthDays[monthDays.length - 1][1];
      const acum1 = lastDay.paso1.acumulado;
      const acum2 = lastDay.paso2.acumulado;
      const total = acum1 + acum2;
      
      const porcentaje = acum1 > 0 && acum2 > 0 
        ? (Math.min(acum1, acum2) / Math.max(acum1, acum2)) * 100 
        : 0;
      
      return {
        paso1: acum1,
        paso2: acum2,
        total: total,
        porcentaje: porcentaje
      };
    };
    
    const monthAccumulated = calculateMonthAccumulated();
    
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
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
                  <p className="text-sm text-gray-600">Acumulado anterior: {formatCurrency(data.paso1.acumuladoAnterior)}</p>
                  <p className="font-bold text-blue-900">Total del día: {formatCurrency(data.paso1.total)}</p>
                  <p className="font-bold text-lg text-blue-900">Acumulado: {formatCurrency(data.paso1.acumulado)}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-gray-700">
                <p>Dato 1: {formatCurrency(data.paso1.dato1)}</p>
                <p>Dato 2: {formatCurrency(data.paso1.dato2)}</p>
                <p className="text-sm text-gray-600">Acumulado anterior: {formatCurrency(data.paso1.acumuladoAnterior)}</p>
                <p className="font-bold text-blue-900">Total del día: {formatCurrency(data.paso1.total)}</p>
                <p className="font-bold text-lg text-blue-900">Acumulado: {formatCurrency(data.paso1.acumulado)}</p>
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
                  <p className="text-sm text-gray-600">Acumulado anterior: {formatCurrency(data.paso2.acumuladoAnterior)}</p>
                  <p className="font-bold text-green-900">Total del día: {formatCurrency(data.paso2.total)}</p>
                  <p className="font-bold text-lg text-green-900">Acumulado: {formatCurrency(data.paso2.acumulado)}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-gray-700">
                <p>Dato 1: {formatCurrency(data.paso2.dato1)}</p>
                <p>Dato 2: {formatCurrency(data.paso2.dato2)}</p>
                <p className="text-sm text-gray-600">Acumulado anterior: {formatCurrency(data.paso2.acumuladoAnterior)}</p>
                <p className="font-bold text-green-900">Total del día: {formatCurrency(data.paso2.total)}</p>
                <p className="font-bold text-lg text-green-900">Acumulado: {formatCurrency(data.paso2.acumulado)}</p>
              </div>
            )}
          </div>

          {/* 🆕 Resumen con acumulado del mes */}
          <div className="border rounded-lg p-4 bg-purple-50">
            <h3 className="font-bold text-lg mb-3 text-purple-900">Resumen del Día</h3>
            <div className="space-y-2 text-gray-700">
              <p>Acumulado Paso 1 (día): {formatCurrency(data.paso1.acumulado)}</p>
              <p>Acumulado Paso 2 (día): {formatCurrency(data.paso2.acumulado)}</p>
              <p className="font-bold text-2xl text-purple-900 mt-4">
                Porcentaje: {data.porcentaje.toFixed(2)}%
              </p>
            </div>
          </div>

          {/* 🆕 Acumulado del mes hasta esta fecha */}
          <div className="border rounded-lg p-4 bg-gradient-to-r from-orange-50 to-pink-50">
            <h3 className="font-bold text-lg mb-3 text-orange-900">📊 Acumulado del Mes</h3>
            <div className="text-center">
              <p className="text-gray-700 text-lg mb-2">
                <strong>Total acumulado:</strong>
              </p>
              <p className="font-bold text-4xl text-orange-900">
                {formatCurrency(monthAccumulated.total)}
              </p>
            </div>
          </div>
        </div>

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
          <p className="text-gray-600">Conectando con Firebase...</p>
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
              {/* 🆕 Mostrar si el día ya fue completado */}
              {isDayCompleted && (
                <div className="mt-2 bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm inline-flex items-center">
                  ✅ Día completado - Datos guardados
                </div>
              )}
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
              
              {todayData.paso1.acumuladoAnterior > 0 && !isDayCompleted && (
                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 mb-4">
                  <p className="text-sm text-yellow-800">
                    📊 <strong>Total del día anterior ({getPreviousDay(currentDate)}):</strong><br/>
                    Paso 1: {formatCurrency(historicalData[getPreviousDay(currentDate)]?.paso1?.total || 0)}
                  </p>
                </div>
              )}
              
              <div className="space-y-4">
                <div>
                  <label className="block text-gray-700 font-semibold mb-2">Dato 1</label>
                  <input
                    type="text"
                    value={formatCurrency(todayData.paso1.dato1)}
                    onChange={(e) => handleInputChange('paso1', 'dato1', e.target.value)}
                    disabled={completedSteps.paso1 || isDayCompleted}
                    className={`w-full p-3 border-2 rounded-lg text-lg ${
                      completedSteps.paso1 || isDayCompleted
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
                    disabled={completedSteps.paso1 || isDayCompleted}
                    className={`w-full p-3 border-2 rounded-lg text-lg ${
                      completedSteps.paso1 || isDayCompleted
                        ? 'border-gray-300 bg-gray-100 text-gray-600 cursor-not-allowed'
                        : 'border-blue-300 focus:border-blue-500 focus:outline-none'
                    }`}
                    placeholder="$0"
                  />
                </div>

                <div className="bg-blue-50 p-4 rounded-lg space-y-1">
                  <p className="text-gray-700 font-semibold">Total del día: {formatCurrency(todayData.paso1.total)}</p>
                  <p className="text-blue-900 font-bold text-xl mt-2 pt-2 border-t border-blue-200">
                    Acumulado: {formatCurrency(todayData.paso1.acumulado)}
                  </p>
                </div>

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
                    📊 <strong>Total del día anterior ({getPreviousDay(currentDate)}):</strong><br/>
                    Paso 2: {formatCurrency(historicalData[getPreviousDay(currentDate)]?.paso2?.total || 0)}
                  </p>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-gray-700 font-semibold mb-2">Dato 1</label>
                  <input
                    type="text"
                    value={formatCurrency(todayData.paso2.dato1)}
                    onChange={(e) => handleInputChange('paso2', 'dato1', e.target.value)}
                    disabled={completedSteps.paso2 || isDayCompleted}
                    className={`w-full p-3 border-2 rounded-lg text-lg ${
                      completedSteps.paso2 || isDayCompleted
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
                    disabled={completedSteps.paso2 || isDayCompleted}
                    className={`w-full p-3 border-2 rounded-lg text-lg ${
                      completedSteps.paso2 || isDayCompleted
                        ? 'border-gray-300 bg-gray-100 text-gray-600 cursor-not-allowed'
                        : 'border-green-300 focus:border-green-500 focus:outline-none'
                    }`}
                    placeholder="$0"
                  />
                </div>

                <div className="bg-green-50 p-4 rounded-lg space-y-1">
                  <p className="text-gray-700 font-semibold">Total del día: {formatCurrency(todayData.paso2.total)}</p>
                  <p className="text-green-900 font-bold text-xl mt-2 pt-2 border-t border-green-200">
                    Acumulado: {formatCurrency(todayData.paso2.acumulado)}
                  </p>
                </div>

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
                  <p className="text-gray-700">Total del día: <span className="font-bold">{formatCurrency(todayData.paso1.total)}</span></p>
                  <p className="text-blue-900 font-bold text-xl mt-2 pt-2 border-t border-blue-200">
                    Acumulado del mes: {formatCurrency(todayData.paso1.acumulado)}
                  </p>
                </div>

                <div className="bg-green-50 p-4 rounded-lg">
                  <h3 className="font-bold text-green-900 mb-3 text-lg">Paso 2</h3>
                  <p className="text-gray-700">Total del día: <span className="font-bold">{formatCurrency(todayData.paso2.total)}</span></p>
                  <p className="text-green-900 font-bold text-xl mt-2 pt-2 border-t border-green-200">
                    Acumulado del mes: {formatCurrency(todayData.paso2.acumulado)}
                  </p>
                </div>

                {/* 🆕 Total del día (suma de ambos pasos del día) */}
                <div className="bg-purple-50 p-4 rounded-lg border-2 border-purple-200">
                  <h3 className="font-bold text-purple-900 text-lg mb-3">Total del Día</h3>
                  <p className="font-bold text-3xl text-purple-900">
                    {formatCurrency(todayData.paso1.total + todayData.paso2.total)}
                  </p>
                  <div className="border-t-2 border-purple-300 pt-3 mt-3">
                    <p className="font-bold text-purple-900 text-2xl">
                      Porcentaje: {todayData.porcentaje.toFixed(2)}%
                    </p>
                  </div>
                </div>

                {/* 🆕 Acumulado del mes (suma de ambos acumulados) */}
                <div className="bg-gradient-to-r from-orange-50 to-pink-50 p-6 rounded-lg border-2 border-orange-300">
                  <h3 className="font-bold text-orange-900 text-xl mb-4">📊 Acumulado del Mes</h3>
                  <p className="text-gray-700 text-lg mb-2">
                    <strong>Total acumulado hasta hoy:</strong>
                  </p>
                  <p className="font-bold text-4xl text-orange-900">
                    {formatCurrency(todayData.paso1.acumulado + todayData.paso2.acumulado)}
                  </p>
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
          <p>💡 Los datos se guardan automáticamente en tu navegador y se sincronizan con la nube.</p>
          <p className="mt-1">☁️ {cloudStatus}</p>
        </div>
      </div>
    </div>
  );
};

export default App;